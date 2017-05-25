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
var sensorObj    = require('./blesensor');
var interfaces   = os.networkInterfaces();
var childProcess = require('child_process');

// router module
var router = express.Router();

BUILD_SVR    = 'build.mastikipathshala.com';
BUILD_URL    = BUILD_SVR + '/' +  BASE_MODULE + '/';

//RESTART

config.post('/api/config/restart/', function(req, res, next) 
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
   cmd_software_restart();

   res.json({success:true});
});

// REBOOT
config.post('/api/config/reboot', function(req, res, next)
{
   if (upgrade_state != 0) {

      res.json({success: 'false' });
      return;
   }

   res.json({success: 'true' });

   exec('sudo reboot', function(err, stdout, stderr) {

      if (err) {
        log.error(err);
      } else {
         log.debug(' rebooting the system...');
      }
   });
});

//IP ADDRESS GET
config.get('/api/config/ip',function(req, res, next)
{
   var addresses = [];

   log.debug(' get-internal-ips');

   interfaces = os.networkInterfaces();

   for (var k in interfaces) {

      log.debug(' interface: ' + k);

      for (var k2 in interfaces[k]) {

          var address = interfaces[k][k2];
          log.debug(' interfaces: ' + k + ': '  + k2 + ': '+ address );

          if (address.family === 'IPv4' && !address.internal) {
              addresses.push(address.address);
          }
      }
   }

   log.debug(' internal ips (' + addresses + ')');
   res.json({success: 'true', address:addresses });
});

// GET EXTERNAL-IP
config.get('/api/config/extip',function(req, res, next) {

   log.debug(' get-external-ip');

   getIP(function (err, ip) {

      if (err || !ip) {

         // every service in the list has failed
         myip = 'NO EXTERNAL IP';
         log.debug(' get external-ip fail (' + err + ')');
         res.json({success: 'false'});
      } else {

         log.debug(' exernal ip (' + ip + ')');
         res.json({success: 'true', address:ip });
      }
   });
});

//LOG LEVEL GET
config.get('/api/config/logLevel/:process',function(req, res, next)
{
   var processName = req.params.process;
   log.debug(' Req : get log level for ' + processName);

   if (redisUp) {
      redisClient.hget("procLogLevel", processName, function(err, reply) {
         if (err || !reply) {
            log.warn(' Resp : Error : get failed ' + err);
            res.json({success: false});
         } else {
            log.debug(' Resp : ' + processName + ' log level : ' + reply);
            res.json({success: 'true', level:reply});
         }
      });
   } else {
      log.warn('Redis not connected');
      res.json({success: false});
   }
});

//LOG LEVEL SET
config.post('/api/config/loglevel',function(req,res,next)
{
   var logLevel = req.body.level;

   //For which service
   var processName = req.body.which;

   log.debug(' Req : setting log-level to ' + logLevel + ' for '+ processName);

   if (redisUp) {

      redisClient.hmset("procLogLevel", processName, logLevel, function(err, reply) {

         if (err) {
            log.warn(' Resp : Error : set failed ' + err);
            res.json({success: false});
         } else {
            if (processName === WEB_SVR_SVC) {
               log.setLevel(logLevel);
            }
            log.debug(' Resp : log-level set to ' + logLevel + ' for '+ processName);
            res.json({success: true});
         }
      });
   } else {
      log.warn(' Redis not connected');
      res.json({success: false});
   }
});


config.get('/api/config/swVersion', function(req, res, next) {
   res.json({success: 'true', version_number: activeVersion.toString()});
});

config.get('/api/config/hwVersion', function(req, res, next) {
   res.json({success: 'true', HWversion_number1: hwVersion.toString()});
});

config.get('/api/config/hwDesc', function(req, res, next) {
   res.json({success: 'true', HWdescription: hwDesc.toString()});
});

config.get('/api/config/hwSerial', function(req, res, next) {
   res.json({success: true, HWserial: hwSerial.toString()});
});

config.post('/api/config/hwSerial',function(req,res,next) {

   var inHwSerial = req.body.hwSerial;

   log.info('new hw Serial ' + inhwSerial);

   fs.readFile(SECURIOT_CONF_FILE, 'utf8', function(err, data) {

      if (err || !data) {
         log.warn(' hw Param config read fail');
         res.json({success: false});
         return;
      }

      var buf = data.toString();
      var obj = JSON.parse(buf);
      obj.hwSerial = inHwSerial;

      fs.writeFile (SECURIOT_CONF_FILE, JSON.stringify(obj), 'utf8', function (err) {
         if (err) {
            log.warn('hw serial write to config file failed');
            res.json({success: false});
            return;
         }

         redisClient.hmset("sysDetail", HARDWARE_SERIAL_TAG, serialNum, function(err, reply) {

            if (err || !reply) {

					log.warn('hw serial write to Redis failed');
               res.json({success: false});
            } else {
               hwSerial = inHwSerial;
               res.json({success: true, HWserial: hwSerial.toString()});
            }
         });
      });
   });
});

config.get('/api/config/kerVersion', function(req, res, next) {
   res.json({success: 'true', keversion: kernelVersion.toString()});
});

config.get('/api/config/fwVersion', function(req, res, next) {
   res.json({success: 'true', firmversion: fwVersion.toString()});
});

config.get('/api/config/wlanMacAddr', function(req, res, next) {
   res.json({success: 'true', wlanmac: wlanMacAddr.toString()});
});

config.get('/api/config/ethMacAddr', function(req, res, next) {
   res.json({success: 'true', ethmac: ethMacAddr.toString()});
});

config.get('/api/config/user', function(req, res, next)
{
   if (redisUp) {

      redisClient.hgetall('user', function(err, reply) {

         if (!err && reply) {

            log.debug(' get user (' + reply + ')');
            res.json({success: 'true', user: reply});
         } else {
            res.json({success: 'false', msg: err});
         }
      });
   } else {
      res.json({success: 'false', msg: err});
   }
})

config.post('/user', function(req, res, next)
{
   if ((typeof req.body.username === "undefined") ||

      (req.body.username === "")) {

      log.debug(' invalid user name');
      res.json({success: 'false'});
      return;
   }

   if (user === req.body.username) {

      log.debug(' same user(' +  user + ')');
   } else {

      log.debug(' old-user(' +  user +
             '), new user(' + req.body.username + ')' );
   }

   if (redisUp) {

      // set the user information in database
      redisClient.del('user', function(err, reply) {

         var req = this.req;
         var res = this.res;

         // set the user information in database
         redisClient.hmset('user', req.body, function(err, reply) {

            var req = this.req;
            var res = this.res;

            if (!err && reply) {

               user = req.body.username; //Set the new user
               password = req.body.password;

               log.debug(' set user(' + req.body + ')');

            } else {

               log.debug(' set user failed(' + req.body.username + ')');
               log.warn(req.body.username + ': user config set fail');
               res.json({success: 'false', msg: err});
            }
         }.bind({req:req, res:res}));

      }.bind({req:req, res:res}));

   } else {

      res.json({success: 'false'});
   }
})

})

config.post('/refresh/', function(req, res, next) {
   sensorObj.refresh();
   res.json({success: 'true'});
})


config.post('/api/config/hostName', function(req, res, next) {

   var ret = false;
   var hostname  = req.body.hostname;
   var errorFlag = false;
   var currentHostName = '';

   hostname = hostname.replace(/ /g,'');

   if (hostname === '' || !(/^[a-z,A-Z,0-9]*$/g).test(hostname)) {

      errorFlag = true;
      res.json({success: false});
      return;
   }

   exec('hostname',

      function(err, stdout, stderr) {

      errorFlag = false;

      if (err) {

         log.error(' ' + err);
         errorFlag = true;
         res.json({success: false});
         return;
      }

      currentHostName = stdout;
      currentHostName = currentHostName.trim();
      currentHostName = currentHostName.replace(/\r?\n|\r/g, "");

      if (currentHostName === '') {

         errorFlag = true;
         res.json({success: false});
         return;
      }

        ret = updateHostName(hostname,currentHostName,res);
        log.debug('current Host Name ' + ret);
   });
})


router.post('/api/config/checkSwVersion', function(req, res,err)
{
   var child;
   var gatewayLocalDir = BASE_DIR;

   log.debug(' hardware version(' + hwVersion.toString() + ')');

   // delete all files named as version
   child = exec('rm -rf ' + BASE_DIR + '/latest*',

      function (error, stdout, stderr) {
         if (error === null) {
            io.emit('swversion', {action:'swversion', status:'deleting'});
         }
   });

   child.stdout.pipe(process.stdout);

   // download latest file from the build server
   var gatewayurl = BUILD_BASE_URL + '/' + BASE_MODULE + '/' + hwVersion +
          '/latest --user=jenkins --password=XXXXXX';

   var cmd = 'wget -P ' + BASE_DIR + ' ' + gatewayurl;

   child = exec(cmd,
      function (error, stdout, stderr) {

         if (error != null) {

            log.warn('wget ' + gatewayUrl + ' exec error: ' + error);
            res.json({success: 'false'});
            return;
         }

         fs.readFile(gatewayLocalDir + '/latest',

            function (err, data) {

               var versionStr;

               if (err) {

                  log.error(err);
                  res.json({success: 'false'});
               } else {

                  var buf = data.toString();
                  var obj = JSON.parse(buf);

                  var timeStamp = obj.timeStamp;
                  var swVersion = obj.swVersion;

                  versionStr = swVersion + "," + timeStamp;

                  log.debug('latest version: ' + versionStr);
                  res.json({success: 'true', lversion: versionStr.toString()});
               }
         });
   });

   child.stdout.pipe(process.stdout);
});


router.get('/api/config/hostname', function(req, res, next) {

   exec('hostname', function(err, stdout, stderr) {

      if (err) {

         res.json({hostName: err});
         throw err;
      } else {

         log.debug(stdout);
         res.json({hostName: stdout});
      }
   });
})


// command functions

var updateHostName = function(hostname,currentHostName,res)
{
    exec('hostname ' + hostname, function(err, stdout, stderr) {

         if (err) {

            errorFlag = true;
            res.json({success: false});
         } else {

              exec("sudo sed -i 's/"+currentHostName+"/"+hostname+"/g' /etc/hosts",

              function(err, stdout, stderr) {

              if (err) {

                errorFlag = true;
                log.error(' get-host error: ' + err);
                res.json({success: false});
              } else {

                exec("sudo sed -i 's/" + currentHostName + "/" + hostname + "/g' /etc/hostname",

                  function(err, stdout, stderr) {

                     if (err) {

                       errorFlag = true;
                       log.error('current-host get error: ' + err);
                       res.json({success: false});
                     
                     } else {

                       exec("sudo service prophecy-diagnostics restart",

                         function (err, stdout, stderr) {

                           log.debug(stdout);
                           res.json({success: true});
                           
                       });
                     }
                });
              }
            });
         }
    });
}

function execute_reboot()
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

function cmd_reboot()
{
   log.debug('restart timeout!');
   setTimeout(execute_reboot, MGMT_TIMEOUT);
}

function cmd_software_restart ()
{
   log.debug(' user initiated restart');
   cmd_service(WEV_SVR_SVC_NAME, 'restart', restart_websvc_err, restart_websvc_end);
}

function cmd_service (service_name, operation, cb_error, cb_next)
{
   // set a time out for exit
   setTimeout(cmd_reboot, EXIT_TIMEOUT);

   var child = spawn('service', [service_name, operation],
          { cwd : BASE_DIR } ), me = this;

   child.stderr.on('data', function (data) {

        data += ' ';
        me.stderr = data.toString();

   });
   
   child.stdout.on('data', function (data) { 

        data += ' ';
        me.stdout = data.toString();
        log.debug(service_name + ': stdout:' + me.stdout);

   });
  
   child.stdout.on('end', function () {

      if (me.stdout) {
         log.debug(service_name + ': stdout:' + me.stdout);
      }

      if (me.stderr) {
         log.debug(service_name + ': stderr:' + me.stderr);
      }

   });
   
   child.on('exit', function (code, signal)
         { if (code) {ret_code = code;} });

   child.on('close', function (code) {

      if (code) {ret_code = code;}

      if (ret_code) {

         log.debug ('service ' + service_name + ': error ( ' + ret_code + ') ' + operation);

         setTimeout(cb_error, MGMT_TIMEOUT);

      } else {

         log.debug ('service ' + service_name + ': end ' + operation);

         setTimeout(cb_next, MGMT_TIMEOUT);
      }
   });
}

function restart_websvc_end()
{
   // software restart successful
   log.debug('restart successful!');
}

function restart_websvc_err(r)
{
   // software restart unsuccessful
   log.debug('restart unsuccessful!');
}

module.exports = router;
module.exports.updateHostName = updateHostName;
