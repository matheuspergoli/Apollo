# API

Apollo exposes the following native web API contracts.

Authentication uses the session cookie issued by `POST /api/login`, not Basic
authentication. Browser requests are same-origin HTTPS. `POST /api/password`
creates initial credentials only when no account exists; later changes require
the current credentials and invalidate the existing session.

The dashboard is fixed to pt-BR. No language endpoint exists and configuration
writes containing the removed `locale` key are rejected. Configuration saves
rewrite the file and do not restart the host; callers must preserve unrelated
keys. A timed-out write may already have applied: verify before repeating it.

## POST /api/login
@copydoc confighttp::login()

@htmlonly
<script src="api.js"></script>
@endhtmlonly

## GET /api/apps
@copydoc confighttp::getApps()

## POST /api/apps
@copydoc confighttp::saveApp()

## POST /api/apps/close
@copydoc confighttp::closeApp()

## POST /api/apps/reorder
@copydoc confighttp::reorderApps()

## POST /api/apps/launch
@copydoc confighttp::launchApp()

## POST /api/apps/delete
@copydoc confighttp::deleteApp()

## GET /api/clients/list
@copydoc confighttp::getClients()

## POST /api/clients/update
@copydoc confighttp::updateClient()

## POST /api/clients/disconnect
@copydoc confighttp::disconnect()

## POST /api/clients/unpair
@copydoc confighttp::unpair()

## POST /api/clients/unpair-all
@copydoc confighttp::unpairAll()

## GET /api/config
@copydoc confighttp::getConfig()

## POST /api/config
@copydoc confighttp::saveConfig()

## POST /api/covers/upload
@copydoc confighttp::uploadCover()

## GET /api/logs
@copydoc confighttp::getLogs()

## POST /api/password
@copydoc confighttp::savePassword()

## POST /api/pin
@copydoc confighttp::savePin()

## POST /api/otp
@copydoc confighttp::getOTP()

## POST /api/reset-display-device-persistence
@copydoc confighttp::resetDisplayDevicePersistence()

## POST /api/restart
@copydoc confighttp::restart()

## POST /api/quit
@copydoc confighttp::quit()

<div class="section_buttons">

| Previous                                    |                                  Next |
|:--------------------------------------------|--------------------------------------:|
| [Performance Tuning](performance_tuning.md) | [Troubleshooting](troubleshooting.md) |

</div>

<details style="display: none;">
  <summary></summary>
  [TOC]
</details>
