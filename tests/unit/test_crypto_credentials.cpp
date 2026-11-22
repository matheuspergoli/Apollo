#include "src/crypto.h"

#include <gtest/gtest.h>

TEST(CryptoCredentials, PreservesSelfSignedRsaCertificateAndPairingSignatures) {
  const auto credentials = crypto::gen_creds("Apollo test host", 2048);
  auto certificate = crypto::x509(credentials.x509);
  auto key = crypto::pkey(credentials.pkey);
  ASSERT_NE(certificate.get(), nullptr);
  ASSERT_NE(key.get(), nullptr);
  EXPECT_EQ(EVP_PKEY_bits(key.get()), 2048);
  EXPECT_EQ(X509_get_signature_nid(certificate.get()), NID_sha256WithRSAEncryption);

  const auto *subject = X509_get_subject_name(certificate.get());
  ASSERT_NE(subject, nullptr);
  EXPECT_EQ(X509_NAME_cmp(subject, X509_get_issuer_name(certificate.get())), 0);
  const auto index = X509_NAME_get_index_by_NID(subject, NID_commonName, -1);
  ASSERT_GE(index, 0);
  const auto *entry = X509_NAME_get_entry(subject, index);
  ASSERT_NE(entry, nullptr);
  unsigned char *common_name = nullptr;
  const auto length = ASN1_STRING_to_UTF8(&common_name, X509_NAME_ENTRY_get_data(entry));
  ASSERT_GE(length, 0);
  const std::string decoded_name {reinterpret_cast<const char *>(common_name), static_cast<std::size_t>(length)};
  OPENSSL_free(common_name);
  EXPECT_EQ(decoded_name, "Apollo test host");
  EXPECT_EQ(X509_verify(certificate.get(), key.get()), 1);

  const std::string_view payload {"pair\0payload", 12};
  const auto signed_payload = crypto::sign256(key, payload);
  ASSERT_EQ(signed_payload.size(), 256);
  const std::string_view signature {reinterpret_cast<const char *>(signed_payload.data()), signed_payload.size()};
  EXPECT_TRUE(crypto::verify256(certificate, payload, signature));
  EXPECT_FALSE(crypto::verify256(certificate, "changed payload", signature));
}

TEST(CryptoCredentials, ExposesCompleteCertificateSignatureBytesForPairing) {
  const auto credentials = crypto::gen_creds("Apollo test host", 2048);
  auto certificate = crypto::x509(credentials.x509);
  ASSERT_NE(certificate.get(), nullptr);
  const auto signature = crypto::signature(certificate);
  ASSERT_EQ(signature.size(), 256);

  // The certificate's DER signatureValue is its final field. Compare the bytes
  // used by pairing with the encoded certificate, not ASN.1 implementation fields.
  const auto size = i2d_X509(certificate.get(), nullptr);
  ASSERT_GT(size, static_cast<int>(signature.size()));
  std::vector<unsigned char> encoded(size);
  auto *output = encoded.data();
  ASSERT_EQ(i2d_X509(certificate.get(), &output), size);
  const std::string_view der {reinterpret_cast<const char *>(encoded.data()), encoded.size()};
  EXPECT_EQ(signature, der.substr(der.size() - signature.size()));

  auto restored = crypto::x509(crypto::pem(certificate));
  ASSERT_NE(restored.get(), nullptr);
  EXPECT_EQ(crypto::signature(restored), signature);
}
