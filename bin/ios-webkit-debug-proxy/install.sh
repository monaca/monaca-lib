#!/usr/bin/env bash

echo "Installing proxy..."

mkdir -p tmp
pushd tmp

PREFIX=`pwd`/install/
export PKG_CONFIG_PATH=$PREFIX/lib/pkgconfig:/usr/local/opt/openssl/lib/pkgconfig

export PATH=/usr/local/opt/openssl/bin:$PATH
# export LD_LIBRARY_PATH=/usr/local/opt/openssl/lib:$LD_LIBRARY_PATH
# export CPATH=/usr/local/opt/openssl/include:$LD_LIBRRAY_PATH


mkdir -p $PREFIX

echo "********** libplist **********"

if [ ! -f 2.0.0.tar.gz ]; then
  wget https://github.com/libimobiledevice/libplist/archive/2.0.0.tar.gz
fi

if [ ! -d libplist-2.0.0 ]; then
  tar xvf 2.0.0.tar.gz
fi

if [ ! -f $PREFIX/lib/libplist.a ]; then
  pushd libplist-2.0.0
  NOCONFIGURE=1 ./autogen.sh
  NOCONFIGURE=1 ./autogen.sh
  ./configure --enable-static --prefix=$PREFIX
  make
  make install
  popd
fi

echo "********** libusbmuxd **********"

if [ ! -f 1.0.10.tar.gz ]; then
  wget https://github.com/libimobiledevice/libusbmuxd/archive/1.0.10.tar.gz
fi

if [ ! -d libusbmuxd-1.0.10 ]; then
  tar xvf 1.0.10.tar.gz
fi

if [ ! -f $PREFIX/lib/libusbmuxd.a ]; then
  pushd libusbmuxd-1.0.10
  NOCONFIGURE=1 ./autogen.sh
  NOCONFIGURE=1 ./autogen.sh
  ./configure --enable-static --prefix=$PREFIX
  make
  make install
  popd
fi

echo "********** libimobiledevice **********"

#if [ ! -f 1.2.0.tar.gz ]; then
#  wget https://github.com/libimobiledevice/libimobiledevice/archive/1.2.0.tar.gz
#fi
if [ ! -d libimobiledevice ]; then
  git clone https://github.com/libimobiledevice/libimobiledevice.git
fi

#if [ ! -d libimobiledevice-1.2.0 ]; then
#  tar xvf 1.2.0.tar.gz
#fi

ln -s $PREFIX/lib lib

if [ ! -f $PREFIX/lib/libimobiledevice.a ]; then
#  pushd libimobiledevice-1.2.0
  pushd libimobiledevice
  NOCONFIGURE=1 ./autogen.sh
  NOCONFIGURE=1 ./autogen.sh
  CFLAGS=-I/usr/local/opt/openssl/include LDFLAGS=-L/usr/local/opt/openssl/lib  ./configure --enable-static --prefix=$PREFIX
  make
  make install
  popd
fi

if [ ! -d ios-webkit-debug-proxy ]; then
  git clone https://github.com/google/ios-webkit-debug-proxy.git
fi

pushd ios-webkit-debug-proxy
NOCONFIGURE=1 ./autogen.sh
NOCONFIGURE=1 ./autogen.sh
LDFLAGS=-all-static ./configure --enable-static --prefix=$PREFIX
make
make install
popd
popd

cp $PREFIX/bin/ios_webkit_debug_proxy .
echo "Finished!"
