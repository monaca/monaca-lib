
For the iOS10, libimobiledevice latest version is necessary.
At now, the latest commit number is b78a42e0531d219e27f5c57350886bc7c14d4684.

However,

idevice_error_t idevice_connection_get_fd(idevice_connection_t connection, int *fd);

in libimobiledevice/include/libimobiledevice/libimobiledevice.h and src/idevice.c

is conflicting with

wi_status idevice_connection_get_fd(idevice_connection_t connection,
    int *to_fd) {

in ios-webkit-debug-proxy/src/webinspector.c.



Therefore the build user should manually comment out idevice_connection_get_fd function
in libimobiledevice.h and idevice.c.


The build steps are following.

[1] Execute `bash install.sh`
[2] Comment out idevice_connection_get_fd function in libimobiledevice/include/libimobiledevice/libimobiledevice.h and libimobiledevice/src/idevice.c.
[3] remove all tmp/lib/libimobiledevice.* files.
[4] Again execute `bash install.sh`


After build ios_webkit_debug_proxy, the followings are necessary.

まずは、依存するライブラリ自身のパスを調べる。(First, check the dependent libraries' path)

$ otool -D libssl.1.0.0.dylib
libssl.1.0.0.dylib:
/usr/local/opt/openssl/lib/libssl.1.0.0.dylib

$ otool -D libcrypto.1.0.0.dylib
libcrypto.1.0.0.dylib:
/usr/local/opt/openssl/lib/libcrypto.1.0.0.dylib

これを次で置き換える (Replace them as follows)

$ chmod a+w libssl.1.0.0.dylib
$ chmod a+w libcrypto.1.0.0.dylib

$ install_name_tool -id "@executable_path/libssl.1.0.0.dylib" libssl.1.0.0.dylib
$ install_name_tool -id "@executable_path/libcrypto.1.0.0.dylib" libcrypto.1.0.0.dylib

次に、依存するライブラリが依存しているライブラリのパスを調べる (Next, check the dependent libraries's of the dependent libraries)

$ otool -L libssl.1.0.0.dylib

関係あるのは (The releated lib is )
/usr/local/Cellar/openssl/1.0.2j/lib/libcrypto.1.0.0.dylib (compatibility version 1.0.0, current version 1.0.0)
のみ

$ otool -L libcrypto.1.0.0.dylib
関係あるのはなかった (There is no libs )

libssl.1.0.0.dylibの依存ライブラリを変更する (Change the dependent libraries of libssl.1.0.0.dylib)

$ install_name_tool -change "/usr/local/Cellar/openssl/1.0.2j/lib/libcrypto.1.0.0.dylib" "@executable_path/libcrypto.1.0.0.dylib" libssl.1.0.0.dylib

最後に、ios_webkit_debug_proxyも変更する (Finally change ios_webkit_debug_proxy)


$ otool -l ios_webkit_debug_proxy  | grep ssl

$ install_name_tool -change "/usr/local/opt/openssl/lib/libssl.1.0.0.dylib" "@executable_path/libssl.1.0.0.dylib" ios_webkit_debug_proxy
$ install_name_tool -change "/usr/local/opt/openssl/lib/libcrypto.1.0.0.dylib" "@executable_path/libcrypto.1.0.0.dylib" ios_webkit_debug_proxy
