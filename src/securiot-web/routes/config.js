var fs           = require('fs');
var os           = require("os");
var exec         = require('child_process').exec;
var glob         = require('glob');
var async        = require('async');
var getIP        = require('external-ip')();
var redis        = require("redis")
var setup        = require('setup')();
var moment       = require('moment-timezone');
var request      = require('request');
var express      = require('express');
var interfaces   = os.networkInterfaces();
var childProcess = require('child_process');

// router module
var config = express.Router();

BUILD_SVR    = 'build.mastikipathshala.com';
BUILD_URL    = BUILD_SVR + '/' +  BASE_MODULE + '/';

//RESTART

config.post('/restart/', function(req, res, next)
{
   log.debug('restart!');

   if (upgradeState != 0) {

      var message = 'rejecting restart request, software upgrade is currently in progress';
      log.debug(message);
      io.emit('update', {action:'update',status:message});
      res.json({success:false});
      return;
   }

   io.emit('update', {action:'update',status:'restarting web-service'});
   webSvcRestart();

   res.json({success:true});
});

// REBOOT
config.post('/reboot', function(req, res, next)
{
   if (upgrade_state != 0) {

      res.json({success:'false'});
      return;
   }

   res.json({success:'true'});

   exec('sudo reboot', function(err, stdout, stderr) {

      if (err) {
        log.error(err);
      } else {
         log.debug(' rebooting the system...');
      }
   });
});

//IP ADDRESS GET
config.get('/ipAddr',function(req, res, next)
{
   var ipAddrs = [];

   log.debug(' ip address get request');

   var interfaces = os.networkInterfaces();

   for (var idx in interfaces) {

      log.debug(' interface: ' + idx);

      for (var jdx in interfaces[idx]) {

          var ipAddr = interfaces[idx][jdx];
          log.debug(' interfaces: ' + idx + ': '  + jdx + ': '+ ipAddr);

          if (ipAddr.family === 'IPv4' && !ipAddr.internal) {
              ipAddrs.push(ipAddr.address);
          }
      }
   }

   log.debug('ipAddrs: ' + ipAddrs);
   res.json({success: true, ipAddr:ipAddrs });
});

// GET EXTERNAL-IP
config.get('/externIpAddr',function(req, res, next) {

   log.debug(' get-external-ip');

   getIP(function (err, ipAddr) {

      if (err || !ipAddr) {

         // every service in the list has failed
         myip = 'INVALID EXTERNAL IP';
         log.debug('external-ip get fail (' + err + ')');
         res.json({success: false});
      } else {

         log.debug(' exernal ip (' + ipAddr + ')');
         res.json({success: true, externIpAddr:ipAddr});
      }
   });
});

//LOG LEVEL GET
config.get('/logLevel/:process',function(req, res, next)
{
   var svcName = req.params.svcName;

   log.debug(svcName + ' get log level request');

   if (redisUp) {

      redisClient.hget("procLogLevel", svcName, function(err, reply) {

         if (err || !reply) {

            log.warn(svcName + ' log-level get failed ' + err);
            res.json({success: false});
         } else {

            log.debug(svcName + ' log level is ' + reply);
            res.json({success: true, logLevel:reply});
         }
      });
   } else {

      log.warn('Redis not connected');
      res.json({success: false});
   }
});

//LOG LEVEL SET
config.post('/logLevel',function(req, res, next)
{
   var svcName  = req.body.svcName;
   var logLevel = req.body.logLevel;

   log.debug(svcName + ' set log-level to ' + logLevel);

   if (redisUp) {

      redisClient.hmset("procLogLevel", svcName, logLevel, function(err, reply) {

         if (err) {
            log.warn(svcName + ' set log-level failed ' + err);
            res.json({success: false});
         } else {
            if (svcName === WEB_SVR_SVC) {

               log.setLevel(logLevel);
            }

            log.debug(svcName + ' set log-level to ' + logLevel + ' successful');
            res.json({success: true});
         }
      });
   } else {
      log.warn(' Redis not connected');
      res.json({success: false});
   }
});


config.get('/swVersionId', function(req, res, next) {
   res.json({success: true, swVersionId: activeVersion.toString()});
});

config.get('/hwVersionId', function(req, res, next) {
   res.json({success: true, hwVersionId: hwVersion.toString()});
});

config.get('/hwDesc', function(req, res, next) {
   res.json({success: true, hwDesc: hwDesc.toString()});
});

config.get('/devName', function(req, res, next) {
   res.json({success: true, devName: hwSerial.toString()});
});

config.post('/devName',function(req,res,next) {

   var inHwSerial = req.body.devName;

   log.info('set hw serial number to ' + inhwSerial);

   fs.readFile(SECURIOT_CONF_FILE, 'utf8', function(err, data) {

      if (err || !data) {

         log.warn(' hw Param config read fail');
         res.json({success: false});
      } else {

         var buf = data.toString();
         var obj = JSON.parse(buf);

         obj.hwSerial = inHwSerial;

         fs.writeFile (SECURIOT_CONF_FILE, JSON.stringify(obj), 'utf8', function (err) {

            if (err) {
               log.warn('hw serial number write to config file failed');
               res.json({success: false});
               return;
            }

            redisClient.hmset("sysDetail", HARDWARE_SERIAL_TAG, serialNum, function(err, reply) {

               if (err || !reply) {

		   			log.warn('hw serial number write to Redis failed');
                  res.json({success: false});
               } else {

                  hwSerial = inHwSerial;
                  res.json({success: true, devName: hwSerial.toString()});
               }
            });
         });
      }
   });
});

config.get('/kernelVersion', function(req, res, next) {
   res.json({success: true, kernelVersion: kernelVersion.toString()});
});

config.get('/fwVersion', function(req, res, next) {
   res.json({success: true, fwVersion: fwVersion.toString()});
});

config.get('/wlanMacAddr', function(req, res, next) {
   res.json({success: true, wlanMacAddr: wlanMacAddr.toString()});
});

config.get('/ethMacAddr', function(req, res, next) {
   res.json({success: true, ethMacAddr: ethMacAddr.toString()});
});

config.get('/user', function(req, res, next)
{
   if (redisUp) {

      redisClient.hgetall('userInfo', function(err, reply) {

         if (!err && reply) {

            log.debug(' get user (' + reply + ')');
            res.json({success: true, user: reply});
         } else {
            res.json({success: false, msg: err});
         }
      });
   } else {
      res.json({success: false, msg: err});
   }
})

config.post('/user', function(req, res, next)
{
   log.debug(JSON.stringify(req.body));

   if ((typeof req.body.userName === 'undefined') ||
      (req.body.userName === '')) {

      log.debug(' invalid user name');
      res.json({success: false});
      return;
   }

   if (user === req.body.userName) {

      log.debug(' same user(' +  user + ')');
      res.json({success: true});
      return;
   } else {

      log.debug(' old-user(' +  user +
             '), new user(' + req.body.userName + ')' );
   }

   if (redisUp) {

      redisClient.del('userInfo', function(err, reply) {

         var req = this.req;
         var res = this.res;

         // set the user information in database
         redisClient.hmset('userInfo', req.body, function(err, reply) {

            var req = this.req;
            var res = this.res;

            if (!err && reply) {

               user = req.body.userName;
               password = req.body.passWord;

               log.debug(' set user(' + req.body + ')');
               res.json({success: true});

            } else {

               log.debug(' set user failed(' + req.body.userName + ')');
               log.warn(req.body.userName + ': user config set fail');
               res.json({success: false, msg: err});
            }
         }.bind({req:req, res:res}));

      }.bind({req:req, res:res}));

   } else {

      res.json({success: 'false'});
   }
})

config.post('/refresh/', function(req, res, next) {
   res.json({success: true});
})

config.post('/hostName', function(req, res, next) {

   var hostName = req.body.hostName;

   hostName = hostName.replace(/ /g,'');

   if (hostName === '' || !(/^[a-z,A-Z,0-9]*$/g).test(hostName)) {

      res.json({success: false});
   } else {
      getHostName (hostName, res);
   }

})

config.get('/latestSwVersionId', function(req, res,err)
{
   var locDir = BASE_DIR;

   log.debug(' hardware version(' + hwVersion.toString() + ')');

   // delete all files named as version
   var cmd = 'rm -rf ' + BASE_DIR + '/latest*';

   var child = exec(cmd, function (error, stdout, stderr) {
      if (error === null) {
         io.emit('swVersion', {action:'latestSwVersionId', status:'deleting'});
      }
   });

   child.stdout.pipe(process.stdout);

   // download latest file from the build server
   var latestVerUrl = BUILD_BASE_URL + '/' + BASE_MODULE + '/' + hwVersion +
          '/latest --user=jenkins --password=XXXXXX';

   var cmd = 'wget -P ' + BASE_DIR + ' ' + latestVerUrl;

   child = exec(cmd, function (error, stdout, stderr) {

      if (error != null) {

         log.warn('wget ' + latestVerUrl + ' exec error: ' + error);
         res.json({success: false});
         return;
      }

      fs.readFile(locDir + '/latest', function (err, data) {

         var versionStr;

         if (err) {

            log.error(err);
            res.json({success: false});
         } else {

            var buf = data.toString();
            var obj = JSON.parse(buf);

            var timeStamp = obj.timeStamp;
            var swVersion = obj.swVersion;

            versionStr = swVersion + "," + timeStamp;

            log.debug('latest version: ' + versionStr);
            res.json({success: true, latestSwVersionId: versionStr.toString()});
         }
      });
   });

   child.stdout.pipe(process.stdout);
});


config.get('/hostName', function(req, res, next) {

   exec('hostname', function(err, stdout, stderr) {

      if (err) {

         res.json({success:false, hostName: err});
      } else {

         log.debug(stdout);
         res.json({success:true, hostName: stdout});
      }
   });
})

config.get('/svrConfig', function(req, res, next) {

   var locDir = BASE_DIR;

   log.debug(' svr config get');

   fs.readFile(locDir + '/svrConfig', function (err, data) {

      if (!data || err) {

         log.error(err);
         res.json({success: false});
      } else {

         var buf = data.toString();

         log.debug('server Config: ' + buf);
         res.json({success: true, svrConfig: buf});
      }
   });

})

config.post('/svrConfig', function(req, res, next) {

   var locDir = BASE_DIR;

   var svrConfig = req.body.svrConfig;

   log.debug(' svr config set');

   // delete all files named as version

   fs.writeFile(locDir + '/svrConfig', svrConfig, 'utf8', function (err) {

      if (err) {

         log.error(err);
         res.json({success: false});
      } else {

         log.debug('server Config: ' + svrConfig);
         res.json({success: true});
      }
   });
})

// command functions

var getHostName = function(hostName, res)
{
   var currHostName = '';

   exec('hostname', function(err, stdout, stderr) {

      if (err) {

         log.error('hostname get fail ' + err);
         res.json({success: false});
      } else {

         currHostName = stdout;
         currHostName = currHostName.trim();
         currHostName = currHostName.replace(/\r?\n|\r/g, "");

         if (currHostName === '') {

            errorFlag = true;
            res.json({success: false});
            return;
         }

        updateHostName(hostName, currHostName, res);
      }
   });
}

var updateHostName = function(hostName, currHostName, res)
{
    var cmd = 'hostname ' + hostName;

    exec(cmd, function(err, stdout, stderr) {

       if (err) {

          errorFlag = true;
          res.json({success: false});
       } else {

          setHostName( hostName, currHostName, res);
       }
    });
}

var setHostName = function( hostName, currHostName, res)
{
   var cmd = "sudo sed -i 's/" + currHostName+"/" + hostName + "/g' /etc/hosts";

   // set in /etc/hosts
   exec(cmd, function(err, stdout, stderr) {

      if (err) {

         log.error('get-host error: ' + err);
         res.json({success: false});
      } else {

         // set in /etc/hostname
         var cmd = "sudo sed -i 's/" + currHostName + '/' + hostName + "/g' /etc/hostname";

         exec(cmd, function(err, stdout, stderr) {

            if (err) {

              log.error('current-host set error: ' + err);
              res.json({success: false});
            } else {

              var cmd = 'sudo service securiot-health-service restart';
              exec(cmd, function (err, stdout, stderr) {

                 log.debug(stdout);
                 res.json({success: true});
              });
            }
         });
      }
   });
}

var executeReboot = function()
{
   log.debug('executing reboot command!');
   exec('sudo reboot', function(err, stdout, stderr) {

      if (err) {

         log.error(err);
      } else {

         log.debug('rebooting...');
      }
   });
}

var rebootCmd = function()
{
   log.debug('restart timeout!');
   setTimeout(executeReboot, SYSTEM_DELAY);
}

var webSvcRestart = function()
{
   log.debug('user initiated restart');
   serviceCmd(WEV_SVR_SVC_NAME, 'restart', websvcRestartErr, websvcRestartDone);
}

var serviceCmd = function(svcName, operation, cb_error, cb_next)
{
   // set a time out for exit
   setTimeout(rebootCmd, EXIT_TIMEOUT);

   var child = spawn('service', [svcName, operation],
          { cwd : BASE_DIR } ), me = this;

   child.stderr.on('data', function (data) {

        data += ' ';
        me.stderr = data.toString();

   });

   child.stdout.on('data', function (data) {

        data += ' ';
        me.stdout = data.toString();
        log.debug(svcName + ': stdout:' + me.stdout);

   });

   child.stdout.on('end', function () {

      if (me.stdout) {
         log.debug(svcName + ': stdout:' + me.stdout);
      }

      if (me.stderr) {
         log.debug(svcName + ': stderr:' + me.stderr);
      }

   });

   child.on('exit', function (code, signal)
         { if (code) {retCode = code;} });

   child.on('close', function (code) {

      if (code) {retCode = code;}

      if (retCode) {

         log.debug ('service ' + svcName + ': error ( ' + retCode + ') ' + operation);

         setTimeout(cb_error, SYSTEM_DELAY);

      } else {

         log.debug ('service ' + svcName + ': end ' + operation);

         setTimeout(cb_next, SYSTEM_DELAY);
      }
   });
}

var webSvcRestartDone = function()
{
   log.debug('restart success');
}

var webSvcRestartErr = function()
{
   log.debug('restart failed');
}

module.exports = config;
