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
var usbDetect    = require ('usb-detection');
var EventEmitter = require('events').EventEmitter;

log = require('loglevel');

var intfCheckTimer;
var usbIntfCheckTimer;
var usbDetectCounter = 0;
var USB_INTF_TIME = 1000;
var INTF_TIME = 10000;
var intfUpState = true;
var dnsUpState  = false;

BASE_MODULE  = 'securiot';
HOST_HOME    = '/home/Kat@ppa';

SVC_MODULE      = BASE_MODULE + '-conn';
SVC_MODULE_NAME = SVC_MODULE + '-service';
SVC_MODULE_PID  = SVC_MODULE + '-pid';

BASE_DIR     = HOST_HOME + '/' + BASE_MODULE + '-gateway/';
WORKING_DIR  = BASE_DIR + '/src/';

var originalFactory = log.methodFactory;

log.methodFactory = function (methodName, logLevel, loggerName) {

    var rawMethod = originalFactory(methodName, logLevel, loggerName);

    return function (message) {

       rawMethod('['+ new Date() + ']' + SVC_MODULE + ': ' + message);
    };
};

log.setLevel('debug');

log.debug(SVC_MODULE + ' service start');
network = new EventEmitter();

/* Redis Client */
redisClient = redis.createClient();

redisClient.on("connect", function()
{
   appSetState();
});

redisClient.on("error", function(error) {

   log.debug('redis disconnected (' + error + ')');
   redisUp = false;
});

var appSetLogLevel = function(callback)
{
   redisClient.hget("procLogLevel", SVC_MODULE_NAME, function(err, reply) {

      if (err || !reply) {

         log.debug('get log-level failed');

         logLevel = 'debug';

         redisClient.hmset("procLogLevel", SVC_MODULE_NAME, logLevel, function(err, reply) {

            if (err) {

               log.debug('set log-level failed');
            } else {

               log.debug( 'set log-level successful (' + logLevel + ')');
            }
         });

      } else {

         logLevel = reply.toString();
      }

      log.debug('log-level (' + logLevel + ')');

      // set the log level
      log.setLevel(logLevel);

      if (callback) { callback(); }
   });
}

// set self-pid
var appSetSelfPid = function(callback)
{
   var now = moment();
   var time_tz = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');

   // store the process details in the redis db

   redisClient.hmset(["procDetails", SVC_MODULE_NAME,
      JSON.stringify({pid:process.pid, startTime:time_tz})],
      function (err, res) {

      if (err) {
         log.error(err);
      }
   });

   redisClient.set(SVC_MODULE_PID, process.pid, function(err, reply) {

      if (err) {
         log.debug('set pid failed');
      } else {
         log.debug('pid set (' + process.pid + ')');
      }
      if (callback) { callback(); }
   });
}

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

   callback();
}

var appSetState = function()
{
   log.debug('redis connected');

   redisUp = true;

   async.series([

      function(callback) {

         appSetLogLevel(callback);
      },

      // self pid
      function(callback) {

         appSetSelfPid(callback);
      },

      function(callback) {

         detectSetupUSBModem (callback);
      },

      function(callback) {
          log.debug('SIGHUP received');
      }
   ]);
}

// catch SIGHUP events
process.on('SIGHUP', function() {

   log.debug('SIGHUP received');

});

var checkInterfaceStatus = function()
{
   var ipAddrs = [];

   intfUpState = true;
   dnsUpState  = true;

   var interfaces = os.networkInterfaces();

   for (var idx in interfaces) {

      log.debug(' interface: ' + idx);

      if (idx != 'lo') {

         for (var jdx in interfaces[idx]) {
         
             var ipAddr = interfaces[idx][jdx];
             log.debug(' interfaces: ' + idx + ': '  + jdx + ': '+ JSON.stringify(ipAddr));
         
             if (ipAddr.family === 'IPv4' && !ipAddr.internal) {
                 ipAddrs.push(ipAddr.address);
             }
         }
      }
   }

   if (ipAddrs.length === 0) {

      intfUpState = false;
   } else {

      /* check ip DNS */
      checkDns();
   }

}

var checkDns = function()
{
    require('dns').lookup('www.microsoft.com',function(err) {

        if (err && err.code == "ENOTFOUND") {
           dnsUpState = false;
        } else {
           checkConnectivity();
        }
    })
}

var checkConnectivity = function() {

   var RE_SUCCESS = /bytes from/i;
   var INTERVAL = 2; // in seconds
   var IP = '8.8.8.8';

   var proc = spawn('ping', ['-v', '-n', '-i', INTERVAL, IP]);
   var rli = rl.createInterface(proc.stdout, proc.stdin);

   network.online = false;

   rli.on('line', function(str) {

      if (RE_SUCCESS.test(str)) {

         if (!network.online) {

           network.online = true;
           network.emit('online');
         }
      } else if (network.online) {

         network.online = false;
         network.emit('offline');
      }
   });
}

intfCheckTimer = setInterval(checkInterfaceStatus, INTF_TIME);
