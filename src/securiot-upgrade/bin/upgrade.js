#!/usr/bin/env node

/* logging module */

log = require('loglevel');

/* required modules */

var fs     = require('fs');
var exec   = require('child_process').exec;
var redis  = require('redis');
var spawn  = require ('child_process').spawn;
var async  = require('async');
var moment = require('moment-timezone');

var activeVersion;
var upgradeVersion;
var installSuccess;
var hwVersion;

var redisUp    = false;
var runType    = 'installStart';
var rebootFlag = false;

BASE_MODULE  = 'securiot';
HOST_HOME    = '/home/Kat@ppa';

MGMT_SVC      = BASE_MODULE + '-mgmt';
MGMT_SVC_NAME = MGMT_SVC + '-service';
MGMT_SVC_PID  = MGMT_SVC + '-pid';
MGMT_SVC_MSG  = MGMT_SVC + '-upgrade-msg';

SVC_MODULE      = BASE_MODULE + '-upgrade';
SVC_MODULE_NAME = SVC_MODULE + '-service';
SVC_MODULE_PID  = SVC_MODULE + '-pid';
SVC_MODULE_MSG  = MGMT_SVC + '-msg';

BASE_DIR    = HOST_HOME + '/' + BASE_MODULE + '-gateway/';
WORKING_DIR = BASE_DIR + 'src/';

SYSTEM_DELAY = 5000;

SECUREIOT_DEFAULT_HARDWARE_VERSION = "RPi3";
SECUREIOT_DEFAULT_HARDWARE_DESCRIPTION = "Raspberry Pi 3 Model B";

var CLEANUP_SCRIPT  = WORKING_DIR + SVC_MODULE + '/routes/cleanup.js'
var INSTALL_SCRIPT  = WORKING_DIR + SVC_MODULE + '/routes/install.js'
var RESTART_SCRIPT  = WORKING_DIR + SVC_MODULE + '/routes/restart.js'
var ROLLBACK_SCRIPT = WORKING_DIR + SVC_MODULE + '/routes/rollback.js'
var UPGRADE_SCRIPT  = WORKING_DIR + SVC_MODULE + '/routes/upgrade.js'


log = require('loglevel');

/* prepend timestamp  */

var originalFactory = log.methodFactory;

log.methodFactory = function (methodName, logLevel, loggerName) {

   var rawMethod = originalFactory(methodName, logLevel, loggerName);

   return function (message) {

      rawMethod('['+ new Date() + ']' + SVC_MODULE_NAME + ': ' + message);
   };
};

/* trace levels ("trace" ,"debug","info","warn","error") in increase order */
log.setLevel('debug');

/* Redis Client */
redisClient = redis.createClient();

log.debug('start');

redisClient.on("connect", function()
{
   var now = moment();
   var time_tz = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');

   redisUp = true;

   // store the process details in the redis db
   redisClient.hmset(["ProcessDetails", SVC_MODULE,
      JSON.stringify({pid:process.pid, startTime:time_tz})],
      function (err, res) {
         if (err) { log.error(err); }

   });

   redisClient.set(SVC_MODULE_PID, process.pid, function(err, reply) {

      if (err) {

         log.debug('upgrade daemon set pid failed');
         setTimeout(process.exit(0), SYSTEM_DELAY);
         return;
      }

      log.debug('upgrade daemon set pid :' + process.pid);
   });

   redisClient.hget("ProcessLogLevel", SVC_MODULE, function(err, reply) {

      if (err || !reply) {

         log.error('Redis: get log-level error(' + err + ')');
         logLevel = 'debug';

         redisClient.hmset("ProcessLogLevel", SVC_MODULE, logLevel, function(err, reply) {

            log.info('Redis: set log-level(' + logLevel + ')');
         });
      } else {
         logLevel = reply.toString();
      }

      log.debug('Redis: get log-level(' + logLevel + ')');

      // set the log level
      log.setLevel(logLevel);
   });
});

redisClient.on("error", function(error) {

   log.debug('redis disconnected (' + error + ')');
   redisUp = false;
});

/* send a sighup to server process */

var pushSighup = function (pid)
{
   try {

      process.kill(pid, 'SIGHUP');
   } catch (e) {

      log.debug ('send sighup fail ' + pid);
   }
}

var writeMessage = function(pid, message)
{

   redisClient.set(MGMT_SVC_MSG, message,

      function(err, reply) {

         if (err) {

            log.debug('status message send failed : '+ err);
            return;
         }

         pushSighup(pid);
      }
   );
}

/* write the message to redis database */
var publishMessage = function(message)
{
   redisClient.get(MGMT_SVC_PID,

      function(err, reply) {

         if (err) {
            log.debug('web-server get pid failed');
            return;
         }

         pid = reply;
         writeMessage(pid, message);
      }
   );
}

/* script exec template */


function execScript (script_name, cb_error, cb_next, callback)
{
   ret_code = 0;

   /* spawn the process for the script */

   var child = spawn('node', [script_name, activeVersion, upgradeVersion, hwVersion, runType],
           { cwd : BASE_DIR } ), me = this;

   child.stderr.on('data', function (data) {

         data += ' ';
         me.stderr = data.toString();
   });

   child.stdout.on('data', function (data) {

         data += ' ';
         me.stdout = data.toString();
         log.debug(script_name + ': stdout:' + me.stdout);

   });

   child.stdout.on('end', function () {

       if (me.stdout) {
          log.debug(script_name + ': stdout:' + me.stdout);
       }

       if (me.stderr) {
          log.debug(script_name + ': stderr:' + me.stderr);
       }

   });

   child.on('exit', function (code, signal)
          { if (code) {ret_code = code;} });

   child.on('close', function (code) {

      if (code) {ret_code = code;}

      if (ret_code) {

         log.debug ('Err:(' + ret_code + ') ' + script_name +
                  ' ' + activeVersion + ' ' +  upgradeVersion + ' ' + hwVersion);

         if (callback) {
            setTimeout(cb_error(callback), SYSTEM_DELAY);
         } else {
            setTimeout(cb_error(), SYSTEM_DELAY);
         }

      } else {

         log.debug ('End: ' + script_name + ' ' + activeVersion +
                  ' ' +  upgradeVersion + ' ' + hwVersion);

         if (callback) {

            setTimeout(cb_next(callback), SYSTEM_DELAY);
         } else {

            setTimeout(cb_next(), SYSTEM_DELAY);
         }
      }
   });
}

/* get package functional block */

var getPkgDone = function(err_code)
{
   log.debug('get package complete');

   publishMessage('get package complete');

   setTimeout(startInstall(), SYSTEM_DELAY);
}

var getPkgErr = function(err_code)
{
   log.debug('get package fail!');

   publishMessage('get package failed');

   setTimeout(publishMessage('failed'), SYSTEM_DELAY);
}

var getPkg = function()
{
   log.debug('Invoking get package script ' + activeVersion + '::' + upgradeVersion);

   publishMessage('fetching package');

   execScript(UPGRADE_SCRIPT, getPkgErr, getPkgDone);
}

/* install package functional block */

var installErr = function(callback)
{
   installSuccess = false;
   log.debug(runType + ' install failed');

   publishMessage(runType + ' install failed');

   callback();
}

var installDone = function(callback)
{
   installSuccess = true;

   log.debug(runType + ': install successful');

   if (runType === 'installRest') {
      rebootFlag = true;
   }
   publishMessage(runType + ': install complete');
   callback();
}

var installPkg = function(callback)
{
   publishMessage(runType + ' installing...');

   execScript(INSTALL_SCRIPT, installErr, installDone, callback);
}

var startInstall = function()
{
   installSuccess = false;

   async.series([

      // untar, and install the files in the working directory

      function(callback) {

         runType = 'installPkg';
         installPkg(callback);
      },

      // install all new in in other places
      // and mark for reboot
      function(callback) {

         if (installSuccess === true) {

            runType = 'installRest';
            installPkg(callback);
         } else {

            callback();
         }
      },

      // and reboot
      function(callback) {

         if (rebootFlag === false) {

            runType = 'svcRestart';
         } else {

            runType = 'sysReboot';
         }

         restartWebSvc();
      }
   ]);
}

// restart function block 

var restartErr = function()
{
   publishMessage('failed');
}

var restartDone = function()
{
   publishMessage('complete');
}

var restartWebSvc = function()
{
   log.debug('restarting web-service');

   publishMessage('restart');

   execScript(RESTART_SCRIPT, restartErr, restartDone);
}

// run the upgrade scripts

var startUpgrade = function()
{
   log.debug(activeVersion + ': upgrade to ' + upgradeVersion + ' in ' + hwVersion);

   getPkg();
}

// fetch hardware version

var fetchHwVersionInfo = function()
{
   redisClient.hget("systemInfo",'sysHwVersion',

      function(err, reply) {

         if (err || !reply) {

            log.debug('hardware version get failed:' + reply + ': ' + err);
            publishMessage('failed');
            return;

         } else {

            hwVersion = reply.toString();
         }

         startUpgrade();
      }
   );
}
// fetch next version
var fetchUpgradeVersionInfo = function()
{
   redisClient.get('systemSwUpgradeVersion',

      function(err, reply) {

         if (err || !reply) {

            log.debug('upgrade version get failed');
            publishMessage('failed');
            return;
         }

         upgradeVersion = reply.toString();

         fetchHwVersionInfo();
      }
   );
}

// fetch current version
var fetchActiveVersionInfo = function()
{
   redisClient.hget("SystemDetails",'sysSwVersion',

      function(err, reply) {

         if (err || !reply) {

            log.debug('fetch active version failed');
            publishMessage('failed');
            return;
         }

         activeVersion = reply.toString();

         fetchUpgradeVersionInfo();
      }
   );
}

// on SIGHUP, start upgrade process
process.on('SIGHUP', function()
{
   log.debug('SIGHUP received');

   fetchActiveVersionInfo();
});
