
/* include modules  */
var fs           = require('fs');
var os           = require('os');
var exec         = require('child_process').exec;
var path         = require('path');
var util         = require('util');
var async        = require('async');
var redis        = require('redis');
var moment       = require('moment-timezone');
var express      = require('express');
var bodyParser   = require('body-parser');
var cookieParser = require('cookie-parser');
cloudConnect     = require ('./cloud_main');
connectivity     = require('./check_connectivity');

BASE_MODULE  = 'securiot';
HOST_HOME    = '/home/Kat@ppa';

BASE_DIR     = HOST_HOME + '/' + BASE_MODULE + '-gateway/';
WORKING_DIR  = BASE_DIR + 'src/';

SVC_MODULE      = BASE_MODULE + '-mgmt';
SVC_MODULE_NAME = SVC_MODULE + '-service';
SVC_MODULE_PID  = SVC_MODULE + '-pid';
SVC_MODULE_MSG  = SVC_MODULE + '-upgrade-msg';

SECURIOT_CONF_FILE    = '/etc/' + BASE_MODULE + '/' + BASE_MODULE + '.conf';
SECURIOT_HW_CONF_FILE = '/etc/' + BASE_MODULE + '/' + BASE_MODULE + '_hw.conf';
SECURIOT_VERSION_FILE = BASE_DIR + 'build/scripts/RELEASE_VERSION';

UPGRADE_VERSION_TAG = 'sysSwUpgradeVersion';

SECURIOT_DEFAULT_HARDWARE_VERSION = "RPi3";
SECURIOT_DEFAULT_HARDWARE_DESCRIPTION = "Raspberry Pi 3 Model B";
SECURIOT_DEFAULT_HARDWARE_SERIAL = "DHB-YY-XXXXX";

SECURIOT_MAINTENANCE_TIMEOUT = (60*60000) // one hour

SOFTWARE_VERSION_TAG      = 'softwareVersion';
KERNEL_VERSION_TAG        = 'kernelVersion';
HARDWARE_VERSION_TAG      = 'hardwareVersion';
FIRMWARE_VERSION_TAG      = 'firmwareVersion';
HARDWARE_SERIAL_TAG       = 'hardwareSerial';
MANUFACTURER_TAG          = 'manufacturer';
OFFLINE_DATA_FILE_TAG     = 'offlineDataFiles'

OFFLINE_DELAY             = 5000
FILE_DELETE_DELAY         = 2000

//Global variables
user = '';
password = '';

hwDesc = '';
hwSerial = '';
hwVersion = '';

activeVersion = '';
upgradeVersion = '';

kernelVersion = '';
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
var system      = require('./routes/system');
var upgrade     = require('./routes/upgrade');
//var statistics  = require('./routes/statistics');
var diagnostics = require('./routes/diagnostics');

var app = express();

// reset the max-listener, to avoid for now.
require('events').EventEmitter.prototype._maxListeners = 0;

log.debug('service start');

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

      callback();
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
      callback();
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

         redisClient.hmset("SystemStatus",'sysWlanMacAddr', wlanMac[0], function(err, reply) {
            if (err) {
               log.debug('wlan mac address set failed');
            }
            callback();
         });

         redisClient.hget("SystemStatus",'sysWlanMacAddr', function(err, reply) {

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

         redisClient.hmset("SystemStatus",'sysEthMacAddr', ethMac[0], function(err, reply) {

            if (err) {
               log.debug('eth mac address set failed');
            }
            callback();
         });

         redisClient.hget("SystemStatus",'sysEthMacAddr', function(err, reply) {

            if (err) {

               log.warn('eth mac address not found');
            } else {

               ethMacAddr = reply.toString();
               log.info('eth mac address(' + ethMacAddr + ')');
            }
         });
   });
}

// get the software version and set in the redis
var appUpdateSystemStatus = function(callback)
{
   var systemStatus = {};
   fs.readFile(SECURIOT_VERSION_FILE, 'utf8', function(err, data) {

      if (err || !data) {
         log.debug('software version detail not found');
         activeVersion = '';

      } else {
         var buf = data.toString();
         log.debug('kernel version (' + buf);
         var obj = JSON.parse(buf);
         activeVersion = obj.system_sw_version;
      }

      softwareVersion = activeVersion;
      systemStatus.softwareVersion =  activeVersion;
      log.debug('software version (' + activeVersion + ')');

      exec('uname -r', function (error, stdout, stderr) {

         if (error) {
            log.debug('exec error: ' + error);
         } else {
            var data = stdout;
            var temp = data.split("\n");
            var kernelVersion = temp[0];
            systemStatus.kernelVersion = kernelVersion;
            log.debug('kernel version (' + kernelVersion + ')');
         }

         exec('sudo vcgencmd version', function (error, stdout, stderr) {

            if (error) {
               log.debug('firmware version detail not found');
               firmwareVersion = '';
            } else {
               var data = stdout;
               firmwareVersion = data.toString().slice(57,99);
               systemStatus.firmwareVersion = firmwareVersion;
               log.debug('firmware version (' + firmwareVersion + ')');
            }

            systemStatus.manufacturer = "SecurIoT.in";
            systemStatus.sensorsAttached = 2;

            redisClient.hmset ("SystemStatus", SOFTWARE_VERSION_TAG, softwareVersion, FIRMWARE_VERSION_TAG, firmwareVersion, KERNEL_VERSION_TAG, kernelVersion, MANUFACTURER_TAG, "SecurIoT.in", function(err, reply) {

               if (err) {
                  log.debug('kernel version set failed');
               }
               cloudConnect.updateSystemStatus (systemStatus);
               callback();
            });
         });
      });
   });
}

//hardware version
var appGetHardwareVersion = function(callback)
{
   redisClient.hget("SystemStatus",HARDWARE_VERSION_TAG, function(err, reply) {

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

            redisClient.hmset("SystemStatus",HARDWARE_VERSION_TAG, hwVersion, function(err, reply) {

               if (err) {
                  log.error('hardware version set failed');
               }

               redisClient.hmset("SystemStatus",HARDWARE_DESCRIPTION_TAG,
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

         redisClient.hget("SystemStatus",HARDWARE_DESCRIPTION_TAG, function(err, reply) {

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

         redisClient.hget("SystemStatus",HARDWARE_SERIAL_TAG, function(err, reply) {

            if (err || !reply) {

               hwSerial = SECURIOT_DEFAULT_HARDWARE_SERIAL;

               redisClient.hmset("SystemStatus",HARDWARE_SERIAL_TAG, hwSerial, function(err, reply) {

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

   log.debug('set host name');
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

/*
      // hardware version
      function(callback) {

         appGetHardwareVersion(callback);
      },

      // mac Addr
      function(callback) {

         appGetWlanMacAddr(callback);
      },

      function(callback) {

         appGetEthmacAddr(callback);
      },
*/

      // check system status
      function(callback) {

         diagnostics.checkSystemStatus();
         callback();
      },

      // Initialize local MQTT client
      function(callback) {

         cloudConnect.mqttLocalClientInit(callback);
      },

      // Initialize cloud MQTT client
      function(callback) {
         cloudConnect.mqttCloudClientInit(callback);
      },
      // software version
      function(callback) {

         appUpdateSystemStatus(callback);
      },

      function(callback) {
         connectivity.connectivityCheckInit(callback);
      },

      // mqtt relay local and cloud client
      function(callback) {

         cloudConnect.mqttGatewayRelayInit(callback);
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

   redisClient.get(SVC_MODULE_MSG, function(err, reply) {

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
app.use('/api/upgrade/', upgrade);
app.use('/api/config/', config);
app.use('/api/system/v1.0', system);
//app.use('/api/stats/', statistics);
//app.use('/api/diag/', diagnostics);
//app.use('/api/analytics/v1.0/',analytics);

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
