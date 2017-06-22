/*************************************************************************
 *
 * $file: check_connectivity.js
 *
 * @brief: Handles event machine for cloud/net connect events
 *
 * @author: Srinibas Maharana
 *
 * @date: 10 June 2017 First cut
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 *
 ************************************************************************/
/* include modules  */
var fs           = require('fs');
var rl           = require('readline');
var os           = require('os');
var dns          = require('dns');
var exec         = require('child_process').exec;
var util         = require('util');
var spawn        = require('child_process').spawn;
var async        = require('async');
var express      = require('express');
var usbDetect    = require ('usb-detection');
var EventEmitter = require('events').EventEmitter;

var connectivity = express.Router();

var intfCheckTimer;
var usbIntfCheckTimer;
var usbDetectCounter = 0;

var INTF_TIME     = 20000;
var USB_INTF_TIME = 10000;

var dnsUpState   = false;
var intfUpState  = false;
var netCheckFlag = false;
var usbModemUp   = false;

var handleNetworkEvents   = true;
var handleInterfaceEvents = true;

var activeIpAddrs    = [];
var activeInterfaces = {};

networkState   = new EventEmitter();
intrfacesState = new EventEmitter();

var setupPPPInterface = function()
{
   var cmd = 'ifconfig';

   exec(cmd, function(err, stdout) {

      var ifData = stdout;

      log.trace('ifconfig: ' + ifData);

      if ((ifData.indexOf("wwan0") > -1) && (ifData.indexOf("ppp") < 0)) {

         var cmd = "sudo wvdialconf";

         exec(cmd, function(err, stdout) {

            log.debug("wwan0 is UP, setting wvdial.conf file");
            var cmd = "sudo wvdial";

            exec(cmd, function(err, stdout) {

               log.debug("Triggered wvdial for wwan0:" + err);
               usbModemUp = true;

               clearInterval(usbIntfCheckTimer);
               usbDetectCounter  = 0;
            });
         });

      } else {

         log.trace(' wwan0 not found, retry count: ' + usbDetectCounter);

         if (usbDetectCounter >= 10) {

            clearInterval(usbIntfCheckTimer);
            usbDetectCounter = 0;
         } else {

            usbDetectCounter ++;
         }
      }
   });
}

var detectSetupUSBModem = function (callback)
{
   usbDetect.on ('add', function (device) {

      log.info ('USB device added, ' + JSON.stringify(device));

      var vendorId  = device.vendorId.toString(16);
      var productId = device.productId.toString(16);

      var usbDeviceFile = '/etc/' + BASE_MODULE + '/usbDeviceList/' + vendorId + ':' + productId;
      log.debug ('USB device file: ' + usbDeviceFile);

      try {

         if (fs.statSync(usbDeviceFile).isFile()) {

            log.debug ('Detected USB modem device (' + usbDeviceFilee + ')');
            // CREATE usb_modeswitch.conf file)

            log.info ("Detected USB Modem in Storage Media mode");
            var cmd = "sudo cp /etc/usb_modeswitch.default /etc/usb_modeswitch.conf";

            exec(cmd, function(err, stdout, stdout) {

               cmd = "sudo echo \"\nDefaultVendor=0x" + vendorId +
                  "\nDefaultProduct=0x" + productId +
                  "\" | sudo tee --append /etc/usb_modeswitch.conf";

               exec(cmd, function(err, stdout, stdout) {

                  cmd = "sudo cat " + usbDeviceFile + ">> /etc/usb_modeswitch.conf"

                  exec(cmd, function(err, stdout, stdout) {

                     log.debug ("USB mode switch conf file generated");
                     cmd = "sudo usb_modeswitch -c /etc/usb_modeswitch.conf"

                     exec(cmd, function(err, stdout, stdout) {

                        log.info ("Switched USB device to Modem mode");
                        usbIntfCheckTimer = setInterval(setupPPPInterface, USB_INTF_TIME);
                     });
                  });
               });
            });
         }
      } catch (e) {
         log.trace ('Detected USB device either not a Modem or already in Modem mode(' + e + ')');
      }

   });

   usbDetect.on ('remove', function (device) {
      log.info ("Removed USB device " + JSON.stringify(device));
   });

   if (callback) { callback(); }
}

var usbModemConnect = function()
{
   usbDetect.find (function (err, device) {

      log.debug ('USB device(' + device.length + ') found: ' + JSON.stringify(device));

      var usbArray = JSON.stringify(device);
      var jsonUsbArray = JSON.parse(usbArray);

      for (var i = 0; i < jsonUsbArray.length; i++) {

         var productId = jsonUsbArray[i].productId.toString(16);
         var vendorId  = jsonUsbArray[i].vendorId.toString(16);

         log.debug ("Vendor ID :" + vendorId + " Product ID :" + productId );

         var usbDeviceFile = '/etc/' + BASE_MODULE + '/usbDeviceList/' + vendorId + ':' + productId;
         log.debug ("USB device file : " + usbDeviceFile);

         try {

            if (fs.statSync(usbDeviceFile).isFile()) {

               // CREATE usb_modeswitch.conf file)
               var cmd = "sudo cp /etc/usb_modeswitch.default /etc/usb_modeswitch.conf";

               exec(cmd, function(err, stdout, stdout) {

                  var cmd = "sudo echo \"\nDefaultVendor=0x" + vendorId +
                     "\nDefaultProduct=0x" + productId +
                     "\" | sudo tee --append /etc/usb_modeswitch.conf";

                  log.debug ('Executing USB mode switch conf: ' + cmd);
                  exec(cmd, function(err, stdout, stdout) {

                     var cmd = "sudo cat " + usbDeviceFile + ">> /etc/usb_modeswitch.conf";

                     exec(cmd, function(err, stdout, stdout) {

                        log.debug ("USB mode switch conf file generated");
                        var cmd = "sudo usb_modeswitch -c /etc/usb_modeswitch.conf";

                        exec(cmd, function(err, stdout, stdout) {
                           log.info ("Switched USB device to Modem mode");
                        });
                     });
                  });
               });
            }
         } catch (e) {
            log.debug ('Detected USB device either not a Modem or already in Modem mode(' + e + ')');
         }

         usbIntfCheckTimer = setInterval(setupPPPInterface, USB_INTF_TIME);
      }
   });
}

var usbModemDisconnect = function()
{
   usbModemUp = false;
}

var connectivityCheckInit = function(cb)
{
   async.series([
      function(callback) {

         detectSetupUSBModem (callback);
      },

      function(callback) {

         networkEventHandler(callback);
      },

      function(callback) {

         networkState.online = false;
         checkInterfaceStatus(callback);
      },

      function(callback) {
         // register nerwork event handler

         if (cb) {cb(); }
      }

   ]);
}

// register nerwork event handler
var networkEventHandler = function(cb)
{
   log.debug('registering for network events');

   if (handleNetworkEvents === true) {

      networkState.on('offline', networkDownHandler);
      networkState.on('online', networkUpHandler);
   }

   if (handleInterfaceEvents === true) {

      intrfacesState.on('offline', interfacesDownHandler);
      intrfacesState.on('online', interfacesUpHandler);
   }

   if (cb) { cb(); }
}

var checkInterfaceStatus = function(cb)
{
   var ipAddrs = [];

   if (netCheckFlag === false) {

      dnsUpState   = true;
      intfUpState  = true;
      netCheckFlag = true;

      log.trace('INTERFACE check');

      var interfaces = os.networkInterfaces();

      for (var idx in interfaces) {

         log.trace(' interface: ' + idx);

         if (idx != 'lo') {

            for (var jdx in interfaces[idx]) {

                var ipAddr = interfaces[idx][jdx];
                log.trace(' interfaces: ' + idx + ': '  + jdx + ': '+ JSON.stringify(ipAddr));

                if (ipAddr.family === 'IPv4' && !ipAddr.internal) {
                   ipAddrs.push(ipAddr.address);
                }
            }
         }
      }

      if (activeIpAddrs.length != ipAddrs.length) {

         if (activeIpAddrs.length == 0) {

            intrfacesState.emit('online');
         } else {

            if (activeIpAddrs.length < ipAddrs.length) {

               intrfacesState.emit('online');
            } else {

               intrfacesState.emit('offline');
            }
         }

         activeIpAddrs    = ipAddrs;
         activeInterfaces = interfaces;
      }

      if (ipAddrs.length === 0) {

         log.debug('INTERFACE DOWN' + JSON.stringify(ipAddrs));
         intfUpState  = false;
         netCheckFlag = false;

         if (networkState.online === true) {

            networkState.online = false;
            networkState.emit('offline');
         } else {
            // nothing
         }

      } else {

         log.trace('INTERFACE OK' + JSON.stringify(ipAddrs));
         /* check ip DNS */
         checkDns();
      }
   }

   if (intfCheckTimer === undefined) {
      intfCheckTimer = setInterval(checkInterfaceStatus, INTF_TIME);
   }

   if (cb) { cb();};

}

var checkDns = function()
{
    log.trace('DNS check');

    dns.lookup('www.microsoft.com',function(err) {

        if (err && err.code == "ENOTFOUND") {

           log.debug('DNS FAIL');
           dnsUpState   = false;
           netCheckFlag = false;

           if (networkState.online === true) {

              networkState.online = false;
              networkState.emit('offline');
           } else {
              // nothing
           }

        } else {

           log.trace('DNS OK');
           checkNet();
        }
    })
}

var checkNet = function()
{
   var delay    = 2; // in seconds
   var count    = 5;

   var data_str = /bytes from/i;
   var stat_str = /ping statistics/i;

   var IP = 'www.microsoft.com';

   log.trace('PING check');

   var proc = spawn('ping', ['-v', '-n', '-c', count,'-i', delay, IP]);

   proc.stdout.on('data', function (data) {

      log.trace('PING out: ' + data);

      if (data_str.test(data) ||
          stat_str.test(data)) {

         netCheckFlag = false;

         if (networkState.online === false) {

           log.trace('PING OK');
           networkState.online = true;
           networkState.emit('online');
         }

      } else if (networkState.online === true) {

         netCheckFlag = false;

         log.debug('PING FAIL');
         networkState.online = false;
         networkState.emit('offline');
      }
   });
}

var interfacesDownHandler = function()
{

   log.debug('interface Down...');
   usbModemConnect();
}

var interfacesUpHandler = function()
{

   log.debug('interface Up...');
}

var networkDownHandler = function()
{

   log.debug('network Down...');
   usbModemConnect();
}

var networkUpHandler = function()
{

   log.debug('network Up...');
   if (usbModemUp === true) {
      usbModemDisconnect();
   }
}

module.exports = connectivity;
module.exports.connectivityCheckInit = connectivityCheckInit;
