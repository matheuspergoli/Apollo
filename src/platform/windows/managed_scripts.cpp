#include "managed_scripts.h"

#include <aclapi.h>
#include <algorithm>
#include <array>
#include <cctype>
#include <cstdint>
#include <fstream>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <sddl.h>
#include <stdexcept>
#include <vector>
#include <windows.h>

namespace managed_scripts {
  namespace {
    using json = nlohmann::json;
    namespace fs = std::filesystem;

    struct handle {
      HANDLE value;

      explicit handle(HANDLE value):
          value(value) {
        if (value == INVALID_HANDLE_VALUE) {
          throw std::runtime_error("Nao foi possivel acessar o armazenamento de scripts.");
        }
      }

      ~handle() {
        CloseHandle(value);
      }
    };

    using lease = std::vector<std::shared_ptr<handle>>;

    struct security {
      PSECURITY_DESCRIPTOR descriptor = nullptr;
      SECURITY_ATTRIBUTES attributes {};

      security() {
        HANDLE token;
        if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
          throw std::runtime_error("Nao foi possivel verificar a identidade do host.");
        }
        handle owner(token);
        TOKEN_ELEVATION elevation {};
        DWORD size;
        if (!GetTokenInformation(token, TokenElevation, &elevation, sizeof(elevation), &size)) {
          throw std::runtime_error("Nao foi possivel verificar os privilegios do host.");
        }
        std::wstring sddl = L"O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;GRGX;;;BU)";
        if (!elevation.TokenIsElevated) {
          GetTokenInformation(token, TokenUser, nullptr, 0, &size);
          std::vector<unsigned char> user(size);
          if (!GetTokenInformation(token, TokenUser, user.data(), size, &size)) {
            throw std::runtime_error("Identidade do host indisponivel.");
          }
          LPWSTR sid = nullptr;
          if (!ConvertSidToStringSidW(reinterpret_cast<TOKEN_USER *>(user.data())->User.Sid, &sid)) {
            throw std::runtime_error("Identidade do host invalida.");
          }
          sddl = L"D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;GRGX;;;BU)(A;OICI;FA;;;" + std::wstring(sid) + L")";
          LocalFree(sid);
        }
        if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(), SDDL_REVISION_1, &descriptor, nullptr)) {
          throw std::runtime_error("Nao foi possivel proteger o armazenamento de scripts.");
        }
        attributes = {sizeof(SECURITY_ATTRIBUTES), descriptor, FALSE};
      }

      ~security() {
        if (descriptor) {
          LocalFree(descriptor);
        }
      }
    };

    bool hex(const std::string &value, std::size_t length) {
      return value.size() == length && std::all_of(value.begin(), value.end(), [](unsigned char c) {
               return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
             });
    }

    std::string random_id() {
      std::array<unsigned char, 16> bytes;
      if (RAND_bytes(bytes.data(), bytes.size()) != 1) {
        throw std::runtime_error("Nao foi possivel criar uma identidade de recurso.");
      }
      constexpr char alphabet[] = "0123456789abcdef";
      std::string result;
      for (auto byte : bytes) {
        result += alphabet[byte >> 4];
        result += alphabet[byte & 15];
      }
      return result;
    }

    void fields(const json &value, std::initializer_list<const char *> allowed) {
      if (!value.is_object()) {
        throw std::runtime_error("Estrutura de script invalida.");
      }
      for (const auto &[key, item] : value.items()) {
        if (std::none_of(allowed.begin(), allowed.end(), [&](const char *name) {
              return key == name;
            })) {
          throw std::runtime_error("Campo de script nao permitido: " + key);
        }
      }
    }

    void reference_valid(const json &reference, bool pending) {
      fields(reference, {"id", "revision", "arguments", "name", "number", "file"});
      if (reference.contains("file")) {
        if (!pending || reference.contains("id") || reference.contains("revision")) {
          throw std::runtime_error("Referencia de script pendente invalida.");
        }
        fields(reference.at("file"), {"name", "data"});
        validate_file(reference.at("file").at("name").get<std::string>(), decode(reference.at("file").at("data").get<std::string>()));
      } else if (!hex(reference.at("id").get<std::string>(), 32) || !hex(reference.at("revision").get<std::string>(), 64)) {
        throw std::runtime_error("Identidade ou revisao de script invalida.");
      }
      if (reference.contains("arguments")) {
        const auto &args = reference.at("arguments");
        if (!args.is_array() || args.size() > 16) {
          throw std::runtime_error("Use ate 16 argumentos literais.");
        }
        for (const auto &arg : args) {
          auto text = arg.get<std::string>();
          if (text.empty() || text.size() > 1024 || text.find_first_of("\r\n") != std::string::npos || text.find('\0') != std::string::npos || text.find('"') != std::string::npos) {
            throw std::runtime_error("Argumentos devem ser textos nao vazios, de uma linha, sem aspas duplas, com ate 1024 bytes.");
          }
        }
      }
    }

    std::shared_ptr<handle> open_checked(const fs::path &path, bool directory) {
      auto file = std::make_shared<handle>(CreateFileW(path.c_str(), directory ? FILE_READ_ATTRIBUTES | READ_CONTROL : GENERIC_READ | READ_CONTROL, directory ? FILE_SHARE_READ | FILE_SHARE_WRITE : FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT | (directory ? FILE_FLAG_BACKUP_SEMANTICS : 0), nullptr));
      BY_HANDLE_FILE_INFORMATION info {};
      if (!GetFileInformationByHandle(file->value, &info) || (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) || static_cast<bool>(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != directory || (!directory && info.nNumberOfLinks != 1)) {
        throw std::runtime_error("Links, juncoes e arquivos ambiguos nao sao permitidos para scripts.");
      }
      return file;
    }

    lease pin(const fs::path &path, bool create) {
      const auto absolute = fs::absolute(path).lexically_normal();
      if (absolute.native().starts_with(L"\\\\") || absolute.native().size() > 230) {
        throw std::runtime_error("Use um armazenamento local de scripts com caminho de ate 230 caracteres.");
      }
      lease result;
      auto current = absolute.root_path();
      result.push_back(open_checked(current, true));
      for (const auto &part : absolute.relative_path()) {
        current /= part;
        if (!fs::exists(current) && create) {
          security acl;
          if (!CreateDirectoryW(current.c_str(), &acl.attributes)) {
            throw std::runtime_error("Nao foi possivel criar a pasta protegida de scripts.");
          }
        }
        result.push_back(open_checked(current, true));
      }
      return result;
    }

    std::string read_bytes(const std::shared_ptr<handle> &file, std::size_t limit) {
      LARGE_INTEGER size {};
      if (!GetFileSizeEx(file->value, &size) || size.QuadPart < 0 || static_cast<std::uint64_t>(size.QuadPart) > limit) {
        throw std::runtime_error("Arquivo de script fora do limite permitido.");
      }
      std::string bytes(static_cast<std::size_t>(size.QuadPart), '\0');
      DWORD count = 0;
      if (!ReadFile(file->value, bytes.data(), bytes.size(), &count, nullptr) || count != bytes.size()) {
        throw std::runtime_error("Nao foi possivel ler o arquivo completo.");
      }
      return bytes;
    }

    json metadata(const fs::path &directory) {
      auto info = json::parse(read_bytes(open_checked(directory / L"resource.json", false), 16384));
      fields(info, {"name", "revisions"});
      validate_file(info.at("name").get<std::string>(), "# metadata validation");
      const auto &revisions = info.at("revisions");
      if (!revisions.is_array() || revisions.empty() || revisions.size() > 16) {
        throw std::runtime_error("Lista de revisoes de script invalida.");
      }
      std::vector<std::string> hashes;
      for (const auto &revision : revisions) {
        fields(revision, {"revision", "number", "size"});
        const auto hash = revision.at("revision").get<std::string>();
        if (!hex(hash, 64) || std::find(hashes.begin(), hashes.end(), hash) != hashes.end() || !revision.at("number").is_number_unsigned() || revision.at("number").get<std::size_t>() != hashes.size() + 1 || !revision.at("size").is_number_unsigned() || revision.at("size").get<std::size_t>() == 0 || revision.at("size").get<std::size_t>() > script_limit) {
          throw std::runtime_error("Metadados de revisao invalidos.");
        }
        hashes.push_back(hash);
      }
      return info;
    }

    void create_file(const fs::path &path, const std::string &bytes) {
      security acl;
      auto file = std::make_shared<handle>(CreateFileW(path.c_str(), GENERIC_WRITE, 0, &acl.attributes, CREATE_NEW, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
      DWORD count;
      if (!WriteFile(file->value, bytes.data(), bytes.size(), &count, nullptr) || count != bytes.size() || !FlushFileBuffers(file->value)) {
        file.reset();
        DeleteFileW(path.c_str());
        throw std::runtime_error("Nao foi possivel gravar o arquivo completo.");
      }
    }

    bool trusted(HANDLE file) {
      PSID owner = nullptr;
      PACL acl = nullptr;
      PSECURITY_DESCRIPTOR descriptor = nullptr;
      if (GetSecurityInfo(file, SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION, &owner, nullptr, &acl, nullptr, &descriptor) != ERROR_SUCCESS) {
        return false;
      }
      auto privileged = [](PSID sid) {
        return IsWellKnownSid(sid, WinLocalSystemSid) || IsWellKnownSid(sid, WinBuiltinAdministratorsSid);
      };
      bool safe = owner && acl && privileged(owner);
      for (DWORD index = 0; safe && index < acl->AceCount; ++index) {
        void *entry = nullptr;
        if (!GetAce(acl, index, &entry)) {
          safe = false;
          break;
        }
        const auto *header = static_cast<ACE_HEADER *>(entry);
        if (header->AceFlags & INHERIT_ONLY_ACE) {
          continue;
        }
        if (header->AceType == ACCESS_DENIED_ACE_TYPE) {
          continue;
        }
        if (header->AceType != ACCESS_ALLOWED_ACE_TYPE) {
          safe = false;
          break;
        }
        const auto *allow = static_cast<ACCESS_ALLOWED_ACE *>(entry);
        const auto writes = GENERIC_ALL | GENERIC_WRITE | FILE_WRITE_DATA | FILE_APPEND_DATA | FILE_WRITE_EA | FILE_WRITE_ATTRIBUTES | WRITE_DAC | WRITE_OWNER | DELETE;
        if ((allow->Mask & writes) && !privileged(const_cast<DWORD *>(&allow->SidStart))) {
          safe = false;
        }
      }
      if (descriptor) {
        LocalFree(descriptor);
      }
      return safe;
    }

    bool process_elevated() {
      HANDLE token;
      if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
        return true;
      }
      handle owner(token);
      TOKEN_ELEVATION elevation {};
      DWORD count;
      return !GetTokenInformation(token, TokenElevation, &elevation, sizeof(elevation), &count) || elevation.TokenIsElevated;
    }

    std::string utf8(const std::wstring &text) {
      const int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text.data(), text.size(), nullptr, 0, nullptr, nullptr);
      if (!size) {
        throw std::runtime_error("Caminho de script invalido.");
      }
      std::string result(size, '\0');
      WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text.data(), text.size(), result.data(), size, nullptr, nullptr);
      return result;
    }

    std::string quote(const std::string &value) {
      std::string result = "\"";
      std::size_t slashes = 0;
      for (char c : value) {
        if (c == '\\') {
          ++slashes;
          continue;
        }
        result.append(c == '"' ? slashes * 2 + 1 : slashes, '\\');
        result += c;
        slashes = 0;
      }
      result.append(slashes * 2, '\\');
      return result + '"';
    }

    // A single visitor defines all supported application-owned command slots.
    template<class Function>
    void visit(json &app, Function function) {
      if (app.contains("cmd-script")) {
        function(app["cmd-script"], app["cmd"], app.value("elevated", false));
      }
      for (const auto *key : {"prep-cmd", "state-cmd"}) {
        if (!app.contains(key)) {
          continue;
        }
        if (!app.at(key).is_array() || app.at(key).size() > 256) {
          throw std::runtime_error("Lista de etapas invalida.");
        }
        for (auto &step : app[key]) {
          if (!step.is_object()) {
            throw std::runtime_error("Etapa de aplicativo invalida.");
          }
          for (const auto *part : {"do", "undo"}) {
            const auto field = std::string(part) + "-script";
            if (step.contains(field)) {
              function(step[field], step[part], step.value("elevated", false));
            }
          }
        }
      }
    }

    json checked_revision(const fs::path &root, const json &reference) {
      reference_valid(reference, false);
      const auto info = metadata(root / reference.at("id").get<std::string>());
      for (const auto &revision : info.at("revisions")) {
        if (revision.at("revision") == reference.at("revision")) {
          return {{"id", reference.at("id")}, {"revision", reference.at("revision")}, {"name", info.at("name")}, {"number", revision.at("number")}, {"arguments", reference.value("arguments", json::array())}};
        }
      }
      throw std::runtime_error("A revisao do script nao esta mais disponivel.");
    }
  }  // namespace

  std::recursive_mutex &mutex() {
    static std::recursive_mutex value;
    return value;
  }

  std::string digest(const std::string &bytes) {
    unsigned char hash[EVP_MAX_MD_SIZE];
    unsigned int size;
    if (EVP_Digest(bytes.data(), bytes.size(), hash, &size, EVP_sha256(), nullptr) != 1) {
      throw std::runtime_error("Falha na verificacao de integridade.");
    }
    constexpr char alphabet[] = "0123456789abcdef";
    std::string result;
    for (unsigned int i = 0; i < size; ++i) {
      result += alphabet[hash[i] >> 4];
      result += alphabet[hash[i] & 15];
    }
    return result;
  }

  std::string encode(const std::string &bytes) {
    std::string result(4 * ((bytes.size() + 2) / 3), '\0');
    EVP_EncodeBlock(reinterpret_cast<unsigned char *>(result.data()), reinterpret_cast<const unsigned char *>(bytes.data()), bytes.size());
    return result;
  }

  std::string decode(const std::string &text) {
    if (text.empty() || text.size() > 4 * ((script_limit + 2) / 3) || text.size() % 4) {
      throw std::runtime_error("Conteudo do script invalido ou muito grande.");
    }
    std::string bytes(text.size() / 4 * 3, '\0');
    int size = EVP_DecodeBlock(reinterpret_cast<unsigned char *>(bytes.data()), reinterpret_cast<const unsigned char *>(text.data()), text.size());
    if (size < 0) {
      throw std::runtime_error("Conteudo do script invalido.");
    }
    if (text.ends_with("==")) {
      size -= 2;
    } else if (text.ends_with("=")) {
      --size;
    }
    if (size < 0) {
      throw std::runtime_error("Conteudo do script invalido.");
    }
    bytes.resize(size);
    if (encode(bytes) != text) {
      throw std::runtime_error("Codificacao do script invalida.");
    }
    return bytes;
  }

  void validate_file(const std::string &name, const std::string &bytes) {
    if (name.size() < 5 || name.size() > 180 || name.find_first_of("/\\\r\n:") != std::string::npos || name.find('\0') != std::string::npos) {
      throw std::runtime_error("Use um nome simples de script .ps1.");
    }
    auto extension = name.substr(name.size() - 4);
    std::transform(extension.begin(), extension.end(), extension.begin(), [](unsigned char c) {
      return std::tolower(c);
    });
    if (extension != ".ps1" || bytes.empty() || bytes.size() > script_limit || bytes.find('\0') != std::string::npos) {
      throw std::runtime_error("Use um script PowerShell de ate 128 KiB, sem bytes nulos.");
    }
    if (!MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, bytes.data(), bytes.size(), nullptr, 0)) {
      throw std::runtime_error("O script deve estar em UTF-8.");
    }
    if (!bytes.starts_with("\xef\xbb\xbf") && std::any_of(bytes.begin(), bytes.end(), [](unsigned char c) {
          return c >= 128;
        })) {
      throw std::runtime_error("Para preservar caracteres no Windows PowerShell, salve o script em UTF-8 com BOM.");
    }
  }

  void atomic_write(const fs::path &path, const std::string &bytes) {
    auto parents = pin(path.parent_path(), false);
    const auto temporary = path.parent_path() / (".write-" + random_id());
    try {
      create_file(temporary, bytes);
      if (fs::exists(path)) {
        // ReplaceFile preserves the destination's security descriptor instead of
        // changing permissions of an existing application library on each save.
        { auto previous = open_checked(path, false); }
        if (!ReplaceFileW(path.c_str(), temporary.c_str(), nullptr, 0, nullptr, nullptr)) {
          throw std::runtime_error("Nao foi possivel substituir o arquivo existente. Consulte o estado antes de repetir.");
        }
      } else if (!MoveFileExW(temporary.c_str(), path.c_str(), MOVEFILE_WRITE_THROUGH)) {
        throw std::runtime_error("Nao foi possivel confirmar a gravacao. Consulte o estado antes de repetir.");
      }
    } catch (...) {
      std::error_code error;
      fs::remove(temporary, error);
      throw;
    }
  }

  bool has_scripts(const json &application) {
    if (application.contains("cmd-script")) {
      return true;
    }
    for (const auto *key : {"prep-cmd", "state-cmd"}) {
      if (application.contains(key) && application.at(key).is_array()) {
        for (const auto &step : application.at(key)) {
          if (step.is_object() && (step.contains("do-script") || step.contains("undo-script"))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  store::store(fs::path data):
      root_(fs::absolute(data).lexically_normal() / L"scripts") {}

  json store::list(const json &applications) {
    std::lock_guard lock(mutex());
    json result = json::array();
    if (!fs::exists(root_)) {
      return result;
    }
    auto parents = pin(root_, false);
    for (const auto &entry : fs::directory_iterator(root_)) {
      const auto id = entry.path().filename().string();
      if (!hex(id, 32)) {
        continue;
      }
      if (result.size() >= 128) {
        throw std::runtime_error("Biblioteca de scripts acima do limite de 128 recursos.");
      }
      auto folder = open_checked(entry.path(), true);
      auto item = metadata(entry.path());
      item["id"] = id;
      item["uses"] = json::array();
      if (applications.contains("apps") && applications.at("apps").is_array()) {
        for (const auto &app : applications.at("apps")) {
          if (!app.is_object()) {
            continue;
          }
          bool used = false;
          const auto scan = [&](const json &owner, const char *field) {
            if (owner.contains(field) && owner.at(field).is_object() && owner.at(field).contains("id") && owner.at(field).at("id") == id) {
              used = true;
            }
          };
          scan(app, "cmd-script");
          for (const auto *key : {"prep-cmd", "state-cmd"}) {
            if (app.contains(key) && app.at(key).is_array()) {
              for (const auto &step : app.at(key)) {
                if (step.is_object()) {
                  scan(step, "do-script");
                  scan(step, "undo-script");
                }
              }
            }
          }
          if (used) {
            item["uses"].push_back({{"uuid", app.value("uuid", "")}, {"name", app.value("name", "")}});
          }
        }
      }
      result.push_back(std::move(item));
    }
    return result;
  }

  json store::read(const json &reference) {
    std::lock_guard lock(mutex());
    auto parents = pin(root_, false);
    reference_valid(reference, false);
    const auto directory = root_ / reference.at("id").get<std::string>();
    auto folder = open_checked(directory, true);
    auto normalized = checked_revision(root_, reference);
    const auto content = read_bytes(open_checked(directory / (reference.at("revision").get<std::string>() + ".ps1"), false), script_limit);
    if (digest(content) != reference.at("revision").get<std::string>()) {
      throw std::runtime_error("O conteudo do script foi alterado. A execucao foi recusada.");
    }
    normalized["data"] = encode(content);
    return normalized;
  }

  json store::put(const json &file) {
    std::lock_guard lock(mutex());
    fields(file, {"name", "data", "id"});
    const auto name = file.at("name").get<std::string>();
    const auto content = decode(file.at("data").get<std::string>());
    validate_file(name, content);
    const auto id = file.value("id", random_id());
    if (!hex(id, 32)) {
      throw std::runtime_error("Identidade de recurso invalida.");
    }
    auto parents = pin(root_, true);
    const bool existing = file.contains("id");
    if (!existing && list(json::object()).size() >= 128) {
      throw std::runtime_error("Limite de 128 scripts atingido.");
    }
    const auto destination = root_ / id;
    const auto directory = existing ? destination : root_ / (".pending-" + id);
    if (existing && !fs::exists(destination)) {
      throw std::runtime_error("O recurso nao esta mais disponivel.");
    }
    if (!existing && fs::exists(destination)) {
      throw std::runtime_error("Identidade de recurso ja existe.");
    }
    auto folders = pin(directory, !existing);
    auto info = existing ? metadata(directory) : json {{"name", name}, {"revisions", json::array()}};
    if (info.at("revisions").size() >= 16) {
      throw std::runtime_error("Limite de 16 revisoes por script atingido.");
    }
    const auto hash = digest(content);
    for (const auto &revision : info.at("revisions")) {
      if (revision.at("revision") == hash) {
        throw std::runtime_error("Este conteudo ja esta salvo neste script.");
      }
    }
    const auto blob = directory / (hash + ".ps1");
    const auto number = info.at("revisions").size() + 1;
    try {
      create_file(blob, content);
      info["revisions"].push_back({{"revision", hash}, {"number", number}, {"size", content.size()}});
      atomic_write(directory / L"resource.json", info.dump(2));
      if (!existing) {
        folders.clear();
        if (!MoveFileExW(directory.c_str(), destination.c_str(), MOVEFILE_WRITE_THROUGH)) {
          throw std::runtime_error("Nao foi possivel publicar o script na biblioteca.");
        }
      }
    } catch (...) {
      if (!existing) {
        try {
          folders = pin(directory, false);
          DeleteFileW(blob.c_str());
          DeleteFileW((directory / L"resource.json").c_str());
          folders.clear();
          RemoveDirectoryW(directory.c_str());
        } catch (...) {
          // Leave an inaccessible staging directory untouched.
        }
      }
      // A failed metadata replacement can have an uncertain outcome. Retain an
      // existing resource's immutable blob rather than break a possible ref.
      throw;
    }
    return {{"id", id}, {"revision", hash}, {"name", info.at("name")}, {"number", number}, {"arguments", json::array()}};
  }

  void store::remove(const std::string &id, const json &applications) {
    std::lock_guard lock(mutex());
    if (!hex(id, 32)) {
      throw std::runtime_error("Identidade de recurso invalida.");
    }
    bool found = false;
    for (const auto &item : list(applications)) {
      if (item.at("id") == id) {
        found = true;
        if (!item.at("uses").empty()) {
          throw std::runtime_error("O script esta vinculado a aplicativos. Remova os vinculos antes de excluir.");
        }
      }
    }
    if (!found) {
      throw std::runtime_error("O script nao esta mais disponivel.");
    }
    auto parents = pin(root_, false);
    const auto directory = root_ / id;
    const auto deleted = root_ / (".deleted-" + random_id());
    if (!MoveFileExW(directory.c_str(), deleted.c_str(), MOVEFILE_WRITE_THROUGH)) {
      throw std::runtime_error("O script esta em uso ou nao pode ser excluido agora.");
    }
    auto folder = open_checked(deleted, true);
    const auto info = metadata(deleted);
    bool complete = true;
    for (const auto &revision : info.at("revisions")) {
      const auto blob = deleted / (revision.at("revision").get<std::string>() + ".ps1");
      if (!DeleteFileW(blob.c_str())) {
        complete = false;
      }
    }
    if (!DeleteFileW((deleted / L"resource.json").c_str())) {
      complete = false;
    }
    folder.reset();
    if (!RemoveDirectoryW(deleted.c_str())) {
      complete = false;
    }
    if (!complete) {
      throw std::runtime_error("O script saiu da biblioteca, mas a remocao dos arquivos nao foi concluida.");
    }
  }

  void store::save_application(json application, const std::function<void(const json &)> &persist) {
    std::lock_guard lock(mutex());
    if (!has_scripts(application)) {
      application.erase("scripts-approved");
      persist(application);
      return;
    }
    if (has_scripts(application) && (!application.contains("scripts-approved") || application.at("scripts-approved") != true)) {
      throw std::runtime_error("Revise os scripts e seus privilegios antes de salvar o aplicativo.");
    }
    application.erase("scripts-approved");
    std::size_t count = 0;
    visit(application, [&](auto &reference, auto &command, bool) {
      if (++count > 32) {
        throw std::runtime_error("Use ate 32 vinculos de scripts por aplicativo.");
      }
      if (!command.is_null() && command != "") {
        throw std::runtime_error("Escolha comando manual ou script, nao os dois no mesmo campo.");
      }
      command = "";
      reference_valid(reference, true);
      if (!reference.contains("file")) {
        read(reference);
      }
    });
    std::vector<fs::path> created;
    bool persisting = false;
    try {
      visit(application, [&](auto &reference, auto &, bool) {
        const auto args = reference.value("arguments", json::array());
        if (reference.contains("file")) {
          reference = put(reference.at("file"));
          created.push_back(root_ / reference.at("id").template get<std::string>());
          reference["arguments"] = args;
        } else {
          reference = checked_revision(root_, reference);
        }
      });
      auto checked = resolve(application);
      persisting = true;
      persist(application);
    } catch (...) {
      if (!persisting) {
        for (const auto &directory : created) {
          try {
            remove(directory.filename().string(), json::object());
          } catch (...) {
            // Retain an incomplete cleanup rather than recursively traversing
            // files or directories not created by this operation.
          }
        }
      }
      throw;
    }
  }

  execution store::resolve(json application) {
    std::lock_guard lock(mutex());
    auto lifetime = std::make_shared<lease>();
    if (!has_scripts(application)) {
      return {std::move(application), lifetime};
    }
    bool pinned = false;
    visit(application, [&](auto &reference, auto &command, bool elevated) {
      reference_valid(reference, false);
      if (!command.is_null() && command != "") {
        throw std::runtime_error("Comando manual e script no mesmo campo. Execucao recusada.");
      }
      if (!pinned) {
        *lifetime = pin(root_, false);
        pinned = true;
      }
      const auto directory = root_ / reference.at("id").template get<std::string>();
      lifetime->push_back(open_checked(directory, true));
      checked_revision(root_, reference);
      auto file = open_checked(directory / (reference.at("revision").template get<std::string>() + ".ps1"), false);
      const auto content = read_bytes(file, script_limit);
      if (digest(content) != reference.at("revision").template get<std::string>()) {
        throw std::runtime_error("O script foi alterado fora do Apollo. Execucao recusada.");
      }
      if ((elevated || process_elevated()) && !trusted(file->value)) {
        throw std::runtime_error("Scripts elevados exigem arquivos protegidos pertencentes a Administradores ou SYSTEM. Importe uma nova copia pelo host com essas permissoes.");
      }
      lifetime->push_back(std::move(file));
      std::array<wchar_t, MAX_PATH> windows {};
      if (!GetSystemDirectoryW(windows.data(), windows.size())) {
        throw std::runtime_error("Windows PowerShell nao encontrado.");
      }
      const auto executable = fs::path(windows.data()) / L"WindowsPowerShell/v1.0/powershell.exe";
      if (!fs::is_regular_file(executable)) {
        throw std::runtime_error("Windows PowerShell nao encontrado.");
      }
      std::string line = quote(utf8(executable.wstring())) + " -NoLogo -NoProfile -NonInteractive -File " + quote(utf8((directory / (reference.at("revision").template get<std::string>() + ".ps1")).wstring()));
      for (const auto &arg : reference.value("arguments", json::array())) {
        line += " " + quote(arg.template get<std::string>());
      }
      command = line;
    });
    return {std::move(application), lifetime};
  }
}  // namespace managed_scripts
