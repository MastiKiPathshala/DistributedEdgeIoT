
/* include modules  */
var fs           = require('fs');
var os           = require('os');
var exec         = require('child_process').exec;
var path         = require('path');
var util         = require('util');
var async        = require('async');
var redis        = require('redis');
var logger       = require('morgan');
var moment       = require('moment-timezone');
var express      = require('express');
var favicon      = require('serve-favicon');
var usbDetect    = require ('usb-detection');
var bodyParser   = require('body-parser');
var cookieParser = require('cookie-parser');

var usbIntfCheckTimer;
var usbDetectCounter = 0;
USB_INTF_TIME = 1000;

WEB_SVR_SVC      = 'securiot-web';
WEB_SVR_SVC_NAME = WEB_SVR_SVC + '-service';
WEB_SVR_SVC_PID  = WEB_SVR_SVC + '-pid';
WEB_SVR_SVC_MSG  = WEB_SVR_SVC + '-upgrade-msg';


HOME_DIR     = '/home/Kat@ppa'
BASE_MODULE  = 'securiot-gateway';
BASE_DIR     = HOME_DIR + '/' + BASE_MODULE;
WORKING_DIR  = BASE_DIR + '/src/';

SECURIOT_CONF_FILE    = "/etc/securiot/securiot.conf";
SECURIOT_HW_CONF_FILE = "/etc/securiot/securiot_hw.conf";
SECURIOT_VERSION_FILE = BASE_DIR + 'build/scripts/RELEASE_VERSION';

UPGRADE_VERSION_TAG = 'sysSwUpgradeVersion';

SECURIOT_DEFAULT_HARDWARE_VERSION = "RPi3";
SECURIOT_DEFAULT_HARDWARE_DESCRIPTION = "Raspberry Pi 3 Model B";
SECURIOT_DEFAULT_HARDWARE_SERIAL = "DHB-YY-XXXXX";

SECURIOT_MAINTENANCE_TIMEOUT = (60*60000) // one hour 

SOFTWARE_VERSION_TAG     = 'sysSwVersion';
FIRMWARE_VERSION_TAG     = 'sysFwVersion';
HARDWARE_VERSION_TAG     = 'sysHwVersion';
HARDWARE_SERIAL_TAG      = 'sysHwSerial';
HARDWARE_DESCRIPTION_TAG = 'sysHwDesc';

//Global variables
user = '';
password = '';

hwDesc = '';
hwSerial = '';
hwVersion = '';

activeVersion = '';
upgradeVersion = '';

kernVersion = '';
fwVersion = '';

ethMacAddr = '';
wlanMacAddr = '';

upgradeState = 0;
hubId = '';

version = ' ';

// module-ids
SECURIOT_MODULE_MGMT  = 0x00;
SECURIOT_MODULE_BLE   = 0x01;
SECURIOT_MODULE_PLC   = 0x02;
SECURIOT_MODULE_GPIO  = 0x03;
SECURIOT_MODULE_SVCS  = 0x04;
SECURIOT_CLOUD        = 0x05;
SECURIOT_WEB          = 0x06;
SECURIOT_MODULE_MAX   = 0x06;
SECURIOT_MODULE_ALL   = 0x0F;

//global Modules

var routes      = require('./routes/index');
var config      = require('./routes/config');
var upgrade     = require('./routes/upgrade');
//var statistics  = require('./routes/statistics');
//var diagnostics = require('./routes/diagnostics');

var app = express();

// reset the max-listener, to avoid for now.
require('events').EventEmitter.prototype._maxListeners = 0;

log.debug('start');

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

redisClient.on("message", function(channel, command)
{
   var arr = command.split(' ');

   io.emit('queue', {status: arr[0], w_status: arr[1]});
   
   log.log('WEB SOCKET STATUS : '+arr[1]);
});

var hostName = os.hostname();

require('getmac').getMac(function(err, macAddress) {

   hubId = hostName + macAddress;
})

// restart the webserver daemon after a fixed interval
var appMaintenanceRestart = function() 
{
   // while upgrade in progress, do not reboot
   if (upgradeState === 0) {

      log.debug('restart(maintenance timeout)');
      process.exit(99);

   } else {

      log.debug('upgrade is in progress, deferring process restart');

      setTimeout(appMaintenanceRestart, SECURIOT_MAINTENANCE_TIMEOUT);
   }
}

// start a time for the maintenance restart
setTimeout(appMaintenanceRestart, SECURIOT_MAINTENANCE_TIMEOUT);

var appSetLogLevel = function(callback)
{
   redisClient.hget("procLogLevel", WEB_SVR_SVC_NAME, function(err, reply) {
    
      if (err || !reply) {

         log.debug('get log-level failed');

         logLevel = 'debug';

         redisClient.hmset("procLogLevel", WEB_SVR_SVC_NAME, logLevel, function(err, reply) {
          
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

      callback();
   });
}

// set self-pid
var appSetSelfPid = function(callback)
{
   var now = moment();
   var time_tz = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');

   // store the process details in the redis db

   redisClient.hmset(["procDetails", WEB_SVR_SVC_NAME, 
      JSON.stringify({pid:process.pid, startTime:time_tz})],
      function (err, res) {

      if (err) {
         log.error(err);
      }
   });

   redisClient.set(WEB_SVR_SVC_PID, process.pid, function(err, reply) {
    
      if (err) {
         log.debug('set pid failed');
      } else {
         log.debug('pid set (' + process.pid + ')');
      }
      callback();
   });
}

// kernel version
var appGetKernelVersion = function(callback)
{
   exec('uname -r', function (error, stdout, stderr) {

      if (error != null) {
         log.debug('exec error: ' + error);
      }

      var data = stdout;
      var kernVer = data.split("\n");

      redisClient.hmset("sysDetail",'sysKernelVersion', kernVer[0], function(err, reply) {

         if (err) {
            log.debug('kernel version set failed');
         }

         callback();
      });

      redisClient.hget("sysDetail",'sysKernelVersion', function(err, reply) {

         if (err) {
            log.debug('kernel version not found');
         } else {
            kernVersion = reply.toString();
            log.debug('kernel version(' + kernVersion + ')');
         }
      });
   });
}

// firmware version
var appGetFirmwareVersion = function(callback)
{
   exec('sudo vcgencmd version',

      function (error, stdout, stderr) {

         if (error != null) {
            log.debug('exec error: ' + error);
         }

         var firmware = stdout;

         data = firmware.toString().slice(57,99);

         redisClient.hmset("sysDetail",FIRMWARE_VERSION_TAG, data, function(err, reply) {

            if (err) {
               log.debug('firmware version set failed');
            }
            callback();
         });

         redisClient.hget("sysDetail",FIRMWARE_VERSION_TAG,function(err,reply){

            if (err) {
               log.debug('firmware version not found');
            } else {

               fwVersion = reply.toString();
               log.debug('firmware version(' + fwVersion + ')');
            }
         });
  });
}

var appGetWlanMacAddr = function(callback)
{
   exec('cat /sys/class/net/wlan0/address'  ,

      function (error, stdout, stderr) {

         if (error != null) {
            log.debug('exec error: ' + error);
         }

         var wlan = stdout;
         var wlanMac = wlan.split("\n");;

         redisClient.hmset("sysDetail",'sysWlanMacAddr', wlanMac[0], function(err, reply) {
            if (err) {
               log.debug('wlan mac address set failed');
            }
            callback();
         });

         redisClient.hget("sysDetail",'sysWlanMacAddr', function(err, reply) {

            if (err) {
               log.debug('wlan mac address not found');
            } else {

               wlanMacAddr = reply.toString();
               log.debug('wlan mac address(' + wlanMacAddr + ')');
            }
         });

   });
}

var appGetEthmacAddr = function(callback)
{

   exec('cat /sys/class/net/eth0/address',

      function (error, stdout, stderr) {

         if (error != null) {
            log.debug('exec error: ' + error);
         }

         var eth = stdout;
         var ethMac = eth.split("\n");

         redisClient.hmset("sysDetail",'sysEthMacAddr', ethMac[0], function(err, reply) {

            if (err) {
               log.debug('eth mac address set failed');
            }
            callback();
         });

         redisClient.hget("sysDetail",'sysEthMacAddr', function(err, reply) {

            if (err) {

               log.warn('eth mac address not found');
            } else {

               ethMacAddr = reply.toString();
               log.info('eth mac address(' + ethMacAddr + ')');
            }
         });
   });
}

var setupPPPInterface = function()
{
   var cmd = "ifconfig";

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

      var usbDev = "/etc/securiot/usbDeviceList/" + vendorId + ":" + productId;
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

// get the software version and set in the redis
var appGetSoftwareVersion = function(callback)
{
   fs.readFile(SECURIOT_VERSION_FILE, 'utf8', function(err, data) {
   
      if (err || !data) {

         log.debug('software version detail not found');
         activeVersion = '';

      } else {

         var buf = data.toString();
         var obj = JSON.parse(buf);
         activeVersion = obj.sysSwVersion;
      }

      version = activeVersion;

      log.debug('software version (' + activeVersion + ')');
   
      redisClient.hmset("sysDetail",SOFTWARE_VERSION_TAG, activeVersion, function(err, reply) {
      
         if (err) {
            log.error('software version set failed');
         }
      
         callback();
      });

      redisClient.hget("sysDetail",SOFTWARE_VERSION_TAG, function(err, reply) {

          if (err) {

             log.debug('software version not found');
          } else {

             activeVersion = reply.toString();
             version = reply.toString().slice(12);
          }
       });
   });
}

//hardware version
var appGetHardwareVersion = function(callback) 
{
   redisClient.hget("sysDetail",HARDWARE_VERSION_TAG, function(err, reply) {
   
      if (err || !reply) {
      
         log.debug('hardware detail not set');
      
         fs.readFile(SECURIOT_CONF_FILE, 'utf8', function(err, data) {
         
            if (err || !data) {
      
               log.debug('hardware detail not found, setting the default values');
      
               hwDesc    = SECURIOT_DEFAULT_HARDWARE_DESCRIPTION;
               hwSerial  = SECURIOT_DEFAULT_HARDWARE_SERIAL;
               hwVersion = SECURIOT_DEFAULT_HARDWARE_VERSION;

            } else {
      
               buf = data.toString();
               obj = JSON.parse(buf);
      
               hwDesc    = obj.sysHwDesc;
               hwSerial  = SECURIOT_DEFAULT_HARDWARE_SERIAL;
               hwVersion = obj.sysHwVersion;

               if (obj.sysHwSerial != "undefined") {
                  hwSerial = obj.sysHwSerial;
               }
            }

            log.debug('HW version (' + hwVersion + ', ' + hwDesc + '), Serial ' + hwSerial);

            redisClient.hmset("sysDetail",HARDWARE_VERSION_TAG, hwVersion, function(err, reply) {
            
               if (err) {
                  log.error('hardware version set failed');
               } 
               
               redisClient.hmset("sysDetail",HARDWARE_DESCRIPTION_TAG,
                  hwDesc, function(err, reply) {
               
                  if (err) {
                        log.error('hardware desciption set failed');
                  }
               });
               callback();
            });
         });

      } else {

         hwVersion = reply.toString();

         redisClient.hget("sysDetail",HARDWARE_DESCRIPTION_TAG, function(err, reply) {

            if (err || !reply) {

               hwDesc = SECURIOT_DEFAULT_HARDWARE_DESCRIPTION;

               redisClient.set(HARDWARE_DESCRIPTION_TAG, hwDesc, function(err, reply) {
               
                  if (err) {
                    log.error('hardware desciption set failed');
                  }
               });

            } else {
               hwDesc = reply.toString();
            }

            log.info('hardware version (' + hwVersion + ',' + hwDesc + ')');

            callback();
         });

         redisClient.hget("sysDetail",HARDWARE_SERIAL_TAG, function(err, reply) {

            if (err || !reply) {

               hwSerial = SECURIOT_DEFAULT_HARDWARE_SERIAL;

               redisClient.hmset("sysDetail",HARDWARE_SERIAL_TAG, hwSerial, function(err, reply) {

                  if (err) {
                    log.error('hardware serial set failed');
                  }
               });

            } else {
               hwSerial = reply.toString();
            }

            log.info(' hardware version (' + hwVersion + ',' + hwDesc + ')');

            //callback();
         });
      }
   });
}

//Boot time hostname check
var appSetHostName = function(cb)
{
   var hostname  = 'SecurIoTGW';

   exec('hostname', function (error, stdout, stderr) {

      if (error != null) {

         log.debug('exec error in hostfile: ' + error);
      } else {

        var activeHostName = '';
        activeHostName = stdout;
        activeHostName = activeHostName.trim();
        activeHostName = activeHostName.replace(/\r?\n|\r/g, "");
    
      }

      if (cb) { cb(); }
   });
}

var appSetState = function()
{

   log.debug('redis connected');

   redisUp = true;

   async.series([

      // set log-level
      function(callback) {

         appSetLogLevel(callback);
      },

      // self pid
      function(callback) {

         appSetSelfPid(callback);
      },

      // software version
      function(callback) {

         appGetSoftwareVersion(callback);
      },

      // hardware version
      function(callback) {

         appGetHardwareVersion(callback);
      },

      //kernel version
      function(callback) {

         appGetKernelVersion(callback);
      },
       
      function(callback) {
         appGetFirmwareVersion(callback);
      },     
         
      // mac Addr
      function(callback) {

         appGetWlanMacAddr(callback);
      },  
      
      function(callback) {

         appGetEthmacAddr(callback);
      },  

/*
      // check system status
      function(callback) {

         diagnostics.checkSystemStatus();
         callback();
      },
*/

      // Detect and Setup USB Modem
      function(callback) {

         detectSetupUSBModem (callback);
      },

      // initialize host name 
       function(callback) {

         appSetHostName(callback);
      }
   ]);
}

// catch SIGHUP events
process.on('SIGHUP', function() {

   log.debug('SIGHUP received');

   redisClient.get(WEB_SVR_SVC_MSG, function(err, reply) {

      if (err) {

         log.debug('upgrade message get failed');
         io.emit('update', {action:'update',status:'failed'});

         upgradeState -= 1;
         upgradeVersion = '';

         redisClient.del(UPGRADE_VERSION_TAG, function(err, reply) {

            if (err) {
               log.debug('upgrade version delete failed');
            }
         });

      } else {

         message = reply.toString();
         log.debug(message);
         io.emit('update', {action:'update', status:message});

         if ((message === 'complete') || (message === 'failed')) {

            upgradeState -= 1;
            upgradeVersion = '';

            redisClient.del(UPGRADE_VERSION_TAG, function(err, reply) {

               if (err) {

                  log.debug('upgrade version delete failed');
               }
            });
         }
      }
   });
});

// view engine setup
app.engine('html', require('hogan-express'));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

// uncomment after placing your favicon in /public
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(function (req, res, next) {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
});

app.use('/', routes);
app.use('/api/upgrade', upgrade);
app.use('/api/config', config);
//app.use('/api/stats', statistics);
//app.use('/api/diag', diagnostics);
//app.use('/api/analytics/v1.0',analytics);

// catch 404 and forward to error handler
app.use(function(req, res, next) {

   var err = new Error('Not Found');
   err.status = 404;
   next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {

   app.use(function(err, req, res, next) {

      res.status(err.status || 500);

      res.render('error', {

         message: err.message,
         error: err
      });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {

   res.status(err.status || 500);

   res.render('error', {

      message: err.message,
      error: {}
   });
});

module.exports = app;
