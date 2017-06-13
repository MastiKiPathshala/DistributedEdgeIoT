/* include modules  */
var fs           = require('fs');
var rl           = require('readline');
var os           = require('os');
var dns          = require('dns');
var exec         = require('child_process').exec;
var path         = require('path');
var util         = require('util');
var spawn        = require('child_process').spawn;
var async        = require('async');
var redis        = require('redis');
var moment       = require('moment-timezone');
var express      = require('express');
var usbDetect    = require ('usb-detection');
var EventEmitter = require('events').EventEmitter;

var connectivity = express.Router();

var intfCheckTimer;
var usbIntfCheckTimer;
var usbDetectCounter = 0;

var INTF_TIME     = 50000;
var USB_INTF_TIME = 10000;

var intfCheck     = false;
var dnsUpState    = false;
var intfUpState   = false;

network = new EventEmitter();

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

               log.debug("Triggered wvdial for wwan0");

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

      var usbDev = '/etc/' + BASE_MODULE + '/usbDeviceList/' + vendorId + ':' + productId;
      log.debug ('USB device file : ' + usbDev);

      try {

         if (fs.statSync(usbDeviceFile).isFile()) {

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
         log.debug ("Detected USB device either not a Modem or already in Modem mode");
      }

   });

   usbDetect.on ('remove', function (device) {
      log.info ("Removed USB device " + JSON.stringify(device));
   });

   usbDetect.find (function (err, device) {

      log.debug ('USB device found: ' + JSON.stringify(device));
      var usbArray = JSON.stringify(device);
      var jsonUsbArray = JSON.parse(usbArray);

      for (var i = 0; i < jsonUsbArray.length; i++) {

         var productId = jsonUsbArray[i].productId.toString(16);
         var vendorId  = jsonUsbArray[i].vendorId.toString(16);

         log.debug ("Vendor ID :" + vendorId + " Product ID :" + productId );

         usbDeviceFile = "/etc/securiot/usbDeviceList/" + vendorId + ":" + productId;
         log.debug ("USB device file : " + usbDeviceFile);

         try {

            if (fs.statSync(usbDeviceFile).isFile()) {

               // CREATE usb_modeswitch.conf file)
               var cmd = "sudo cp /etc/usb_modeswitch.default /etc/usb_modeswitch.conf";

               exec(cmd, function(err, stdout, stdout) {
                  var cmd = "sudo echo \"\nDefaultVendor=0x" + vendorId +
                     "\nDefaultProduct=0x" + productId +
                     "\" | sudo tee --append /etc/usb_modeswitch.conf";

                  exec(cmd, function(err, stdout, stdout) {
                     var cmd = "sudo cat " + usbDeviceFile +
                        ">> /etc/usb_modeswitch.conf";

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
            log.debug ("Detected USB device either not a Modem or already in Modem mode");
         }

         usbIntfCheckTimer = setInterval(setupPPPInterface, USB_INTF_TIME);
      }
   });

   if (callback) { callback(); }
}

var connectivityCheckInit = function(cb)
{
   async.series([
      function(callback) {

         detectSetupUSBModem (callback);
      },

      function(callback) {

         network.online = false;
         checkInterfaceStatus(callback);
      },

      function(callback) {

         networkChangeEventHandler(callback);
      },

      function(callback) {
         // register nerwork event handler

         if (cb) {cb(); }
      }

   ]);
}

// register nerwork event handler
var networkChangeEventHandler = function(cb)
{
   network.on('offline', networkDownHandler);
   network.on('onine', networkUpHandler);
}

var networkDownHandler = function()
{

   log.debug('network Down.');
   usbIntfCheckTimer = setInterval(setupPPPInterface, USB_INTF_TIME);
}

var networkUpHandler = function()
{

   log.debug('network Up.');
}
var checkInterfaceStatus = function(cb)
{
   var ipAddrs = [];


   if (intfCheck === false) {

      intfCheck   = true;
      intfUpState = true;
      dnsUpState  = true;

      log.debug('INTERFACE check');

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

      if (ipAddrs.length === 0) {

         log.debug('INTERFACE DOWN' + JSON.stringify(ipAddrs));
         intfCheck   = false;
         intfUpState = false;
         if (network.online === true) {
         
            network.online = false;
            network.emit('offline');
         } else {
            // nothing
         }

      } else {

         log.debug('INTERFACE OK' + JSON.stringify(ipAddrs));
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
    log.debug('DNS check');

    require('dns').lookup('www.microsoft.com',function(err) {

        if (err && err.code == "ENOTFOUND") {

           log.debug('DNS FAIL');
           intfCheck  = false;
           dnsUpState = false;

           if (network.online === true) {
           
              network.online = false;
              network.emit('offline');
           } else {
              // nothing
           }

        } else {

           log.debug('DNS OK');
           checkNet();
        }
    })
}

var checkNet = function() {

   var delay    = 2; // in seconds
   var count    = 5;

   var data_str = /bytes from/i;
   var stat_str = /ping statistics/i;

   var IP = 'www.microsoft.com';

   log.debug('PING check');


   var proc = spawn('ping', ['-v', '-n', '-c', count,'-i', delay, IP]);

   proc.stdout.on('data', function (data) {

      log.trace('PING out: ' + data);

      if (data_str.test(data) ||
          stat_str.test(data)) {

         intfCheck  = false;

         if (network.online === false) {

           log.debug('PING OK');
           network.online = true;
           network.emit('online');
         }

      } else if (network.online === true) {

         intfCheck  = false;

         log.debug('PING FAIL');
         network.online = false;
         network.emit('offline');
      }
   });
}

module.exports = connectivity;
module.exports.connectivityCheckInit = connectivityCheckInit;
