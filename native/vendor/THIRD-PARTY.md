# Vendored virtual HID client notices

This directory contains the exact transitive C++ headers required by the service bridge, copied without edits from [Karabiner-DriverKit-VirtualHIDDevice v8.6.0](https://github.com/pqrs-org/Karabiner-DriverKit-VirtualHIDDevice/tree/v8.6.0), commit `9036bc771259ff8d61341f4d1b7072b954fdb2fa`. `manifest.json` records the SHA-256 of every included file. No driver source is rebuilt or re-signed here.

The upstream repository is Unlicense (`UPSTREAM-LICENSE.md`). Its individual pqrs header notices specify Boost Software License 1.0; these notices remain in every original file. The official client embeds protocol 7 and driver version 1.8.0.

| Included headers | Upstream version | License |
| --- | --- | --- |
| pqrs/karabiner/driverkit | v8.6.0 | Boost 1.0 |
| pqrs/dispatcher | v2.19.0 | Boost 1.0 |
| pqrs/gsl | v1.3.0 | Boost 1.0 |
| pqrs/hid | v3.2.0 | Boost 1.0 |
| pqrs/unix_domain_stream | v4.2.0 | Boost 1.0 |
| asio | asio-1-38-2 | Boost 1.0 |
| gsl | Microsoft GSL v5.0.1 | MIT, Microsoft Corporation |
| nod | v0.5.4 | MIT, Fredrik Berggren |
| type_safe | v0.2.4 | MIT, Jonathan Müller |

Full license texts are in `licenses/`. Exact dependency declarations are preserved in `upstream-package-lock.cmake` from the upstream submodule commit `aee2df73e2abdfb4a6db08c1ece53f908eabc2c5`.

License sources: [Boost/Asio](https://github.com/chriskohlhoff/asio/blob/asio-1-38-2/LICENSE_1_0.txt), [GSL](https://github.com/microsoft/GSL/blob/v5.0.1/LICENSE), [nod](https://github.com/fr00b0/nod/blob/v0.5.4/LICENSE), [type_safe](https://github.com/foonathan/type_safe/blob/v0.2.4/LICENSE).

The downloadable signed DriverKit package and its manager/daemon remain separate upstream binaries, with their upstream signatures and licenses preserved by the installer.
