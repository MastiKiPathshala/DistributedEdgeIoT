/*************************************************************************
 *
 * $file: <file name>
 *
 * @brief: <brief description of file>
 *
 * @author: <Author name and email>
 *
 * @date: <date with change log in reverse chronological order>
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 *
 ************************************************************************/
var express = require('express');
var router = express.Router();
var fs = require('fs');
var exec = require('child_process').exec;
var moment = require('moment-timezone');
var request = require('request');
var childProcess = require('child_process');

var os = require("os");
var interfaces = os.networkInterfaces();
const TIME_PERIOD_5MINS = (5*60*1000);

var cpuTemp;
var ramStatus;
var devices;
var upTime;
var diskSpace;
var intfNames     = [];
var intfState     = [];
var wifiStatus    = [];
var bleStatus     = [];
var cloudStatus   = [];
var serviceStatus = [];

// cpu temperature

var checkTemperature = function(callback)
{
   exec("vcgencmd measure_temp", function(error, stdout, stderr) {

      if (error != null) {
         log.debug('exec error: '+error)
      }

      var data = stdout.toString().split('\n');

      cpuTemp = data;

      log.debug( '  CPU temperature');

      for (var idx in data) {
         if (data[idx]) {
            log.debug(data[idx]);
         }
      }

      if (callback) { callback(); }
   });
}

router.get('/cpuTemp', function(req, res, next)
{
   checkTemperature(function() {
      res.json({success: 'true', status:cpuTemp });
   });
});

//RAM usage status

var checkRamStatus = function(callback)
{
   exec("free -o -h | grep Mem:", function(error, stdout, stderr) {

      if (error != null) {
         log.debug('exec error: '+error)
      }

      var data = stdout.toString().split('\n');

      ramStatus = data;

      log.debug( '  RAM status');

      for (var idx in data) {

         if (data[idx]) {
            log.debug(data[idx]);
         }
      }

      if (callback) { callback(); }
   });
}

router.get('/Ram', function(req, res, next)
{
   checkRamStatus(function() {

      res.json({success: 'true', status:ramStatus});
   });
})

//SecurIoT Gateway uptime.......
var checkUpTime = function(callback)
{
	var cmd = "uptime";

	exec(cmd, function(error, stdout, stderr) {

      if (error != null) {
         log.error("checkUpTime (" + cmd + ") error: " + error)
      }

      log.debug("SecurIoT Gateway uptime: ");

      var data = stdout.toString().split('\n');
      upTime = data;

      for (var idx in data) {
         if (data[idx]) {
            log.debug(data[idx]);
         }
      }

      if (callback) { callback(); }
   });
}

router.get('/upTime', function(req, res, next)
{
   checkUpTime(function() {

      res.json({success: 'true', status:upTime});
   });
});

//sd card disk space.......
var checkDiskStatus = function(callback)
{
   var cmd = " df -hT /home | grep /dev/root";

   exec(cmd, function(error, stdout, stderr) {

      if (error != null) {
         log.error("checkDiskStatus (" + cmd + ") error: " + error)
      }

      var data = stdout.toString().split('\n');

      diskSpace = data;

      log.debug("SecurIoT Gateway disk status: ");

      for (var idx in data) {

         if (data[idx]) {
            log.debug(data[idx]);
         }
      }

      if (callback) { callback(); }
   });
}

router.get('/diskSpace', function(req, res, next)
{
   checkDiskStatus(function() {

      res.json({success: 'true', status:diskSpace});
   });
});

// interface status....
var checkIntfStatus = function(callback)
{
   var intf_idx = 0;
   var cmd = " ip -o link show | awk -F': ' '{print $2}'";

   exec(cmd, function (error, stdout, stderr) {

      if (error !=  null) {
         log.error("checkIntfList (" + cmd + ") error: " + error)
      }

      intfNames = stdout.toString().split("\n");
      log.debug("SecurIoT Gateway interfaces (count = " + (intfNames.length - 1) + "): " + intfNames);

      for (var idx = 0; idx < intfNames.length - 1; idx++) {

         collect_interface_status(idx, function() {

            intf_idx++;

            if (intf_idx === (intfNames.length - 1)) {

               if (callback) { callback(); }
            }
         });
      }
   });
}

function collect_interface_status(idx, callback)
{
   var cmd = 'ifconfig ' + intfNames[idx];

   exec(cmd, function (error, stdout, stderr) {

      if (error != null) {
         log.error("checkIntfStatus (" + cmd + ") error: " + error)
      }

      //var data = stdout.toString().split('\n');
      //intfState[idx] = data[0];
      var data = stdout.toString();
      intfState[idx] = data;

      log.debug("Interface status: " + intfState[idx]);

      if (callback) { callback(); }
   });
}

router.get('/intfnames', function(req, res, next)
{
   checkIntfStatus(function() {

      res.json({success: 'true', status: intfNames});
   });
})

router.get('/intfstate', function(req, res, next) {

   checkIntfStatus(function() {

      res.json({success: 'true', status: intfState});
   });
})

//Wifi Status
var checkWiFiStatus = function(callback)
{
	wifiStatus = [];
	var cmd = "iwconfig";
	exec(cmd, function (error, stdout, stderr) {

      if (error != null) {
         log.error("checkWiFiStatus (" + cmd + ") error: " + error)
      }

      var data = stdout.toString().split('\n');

      log.debug("SecurIoT Gateway Wi-Fi status: ");

      for (var idx in data) {

         if (data[idx]) {
            log.debug(data[idx]);
            wifiStatus += data[idx] + '\n';
         }
      }

      if (callback) { callback(); }
   });
}

router.get('/wifi', function(req, res, next)
{
   checkWiFiStatus(function() {

      res.json({success: 'true', status: wifiStatus});
   });
})

//BLE Status
var checkBleStatus = function(callback)
{
	bleStatus = [];
	var cmd = "hciconfig";
	exec(cmd, function (error, stdout, stderr) {

      if (error != null) {
         log.error("checkBLEStatus (" + cmd + ") error: " + error)
      }

      var data = stdout.toString().split('\n');

      log.debug("SecurIoT Gateway BLE status: ");

      for (var idx in data) {
         if (data[idx]) {
            log.debug(data[idx]);
            bleStatus += data[idx] + '\n';
         }
      }
      if (callback) { callback(); }
   });
}

router.get('/ble', function(req, res, next)
{
   checkBleStatus(function() {

      res.json({success: 'true', status: bleStatus});
   });
})

//Server Connectivity Status

var checkServerConnectivity = function(callback)
{
   log.debug( '  check service connectivity');

   cloudStatus = [];

   var alldone = false;

   var dataUrl  = DATAURL.toString().split(':');
   var dataServ = dataUrl[1].toString().split('/');
   var dataPort = dataUrl[2].toString().split('/');

   var diagUrl  = DIAGURL.toString().split(':');
   var diagServ = diagUrl[1].toString().split('/');
   var diagPort = diagUrl[2].toString().split('/');

   var mgmtUrl  = MGMTURL.toString().split(':');
   var mgmtServ = mgmtUrl[1].toString().split('/');
   var mgmtPort = mgmtUrl[2].toString().split('/');

/*
   var user_url  = USERURL.toString().split(':');
   var user_svc  = user_url[1].toString().split('/');
   var user_port = user_url[2].toString().split('/');

   var login_url  = LOGINURL.toString().split(':');
   var login_svc  = login_url[1].toString().split('/');
   var login_port = login_url[2].toString().split('/');
*/

   var ctrlUrl  = CTRLURL.toString().split(':');
   var ctrlServ  = ctrlUrl[1].toString().split('/');
   var ctrlPort = ctrlUrl[2].toString().split('/');

/*
   var urls  = ws_svc[2] + ',' + diag_svc[2] + ',' + live_svc[2] + ',' + user_svc[2] + ',' + login_svc[2] + ',' + sensor_svc[2];
   var ports = ws_port[0] + ',' + diag_port[0] + ',' + live_port[0] + ',' + user_port[0] + ',' + login_port[0] + ',' + sensor_port[0];
*/
   var urls  = dataServ[2] + ',' + diagServ[2] + ',' + mgmtServ[2] + ',' + ctrlServ[2];
   var ports = dataPort[0] + ',' + diagPort[0] + ',' + mgmtPort[0] + ',' + ctrlPort[0];

   var allUrl  = urls.toString().split(",");
   var allPort = ports.toString().split(",");
   var urlMax = allUrl.length;
   var urlIndex = 0;

   for (var idx in allUrl) {

      cloud_server_status(allUrl[idx], allPort[idx], function() {

         urlIndex ++;

         if (urlIndex === urlMax) {

            if (alldone === false) {
               alldone = true;
               if (callback) { callback(); }
            }
         }
      }.bind({callback:callback}));
   }

   // take a timeout of 5 seconds, before declaring done

   setTimeout(function() {
      if (alldone === false) {
         alldone = true;
         if (callback) { callback(); }
      }
   }, 5000);
}

var cloud_server_status = function(url, port, callback)
{
   var command = "nc -zv " + url + " " + port;

   exec(command, function (error, stdout, stderr) {

      if (stdout) {
         var data = stdout.toString().split('\n')
         cloudStatus += data + ',';
         log.debug('url: ' + url + ' port-no: ' + port + ', stdout: ');
         for (var idx in data) {
            if (data[idx]) {
               log.debug(data[idx]);
            }
         }
      }

      if (stderr) {
         var data = stderr.toString().split('\n')
         cloudStatus += data + ',';
         log.debug('url: ' + url + ' port-no: ' + port);
         for (var idx in data) {
            if (data[idx]) {
               log.debug(data[idx]);
            }
         }
      }

      if (callback) { callback(); }
   });
}

router.get('/servers', function(req, res, next)
{
   checkServerConnectivity(function() {

      res.json({success: 'true', status: cloudStatus});
   });
})

// List of attached USB devices

var checkDeviceStatus = function(callback)
{
	devices = '';

	var cmd = "lsusb"
	exec(cmd, function(error, stdout, stderr) {

		if (error != null) {
			log.error("checkDeviceStatus (" + cmd + ") error: " + error)
		}

		var data = stdout.toString().split('\n');
		log.debug( '  device status');

		for (var idx in data) {

			if (data[idx]) {

				log.debug(data[idx]);
				devices += data[idx] + '\n';
			}
		}

		if (callback) {
			callback();
		}
	});
}

router.get('/devices', function(req, res, next)
{
   checkDeviceStatus(function() {

      res.json({success: 'true', status:devices });
   });
});

// Process health status

var checkServicesStatus = function(callback)
{
	var cmd = "sudo forever list --no-colors";
	exec(cmd, function (error, stdout, stderr) {

      if (error != null) {
         log.error("checkServicesStatus (" + cmd + ") error: " + error)
      }

      var data = stdout.toString().split('\n');
      serviceStatus = data;
      log.debug("SecurIoT Gateway services status: ");

      for (var idx in data) {
         if (data[idx]) {
            log.debug(data[idx]);
         }
      }

      if (callback) { callback(); }
   });
}

router.get('/services', function(req, res, next)
{

   checkServicesStatus (function() {

      res.json({success: 'true', status: serviceStatus});
   });
})

//DIAGNOSTIC BUNDLE UPLOAD

router.post('/diagnostics', function(req, res, next)
{
	sendRemoteDiagnostics (res);
});

var sendRemoteDiagnostics = function (res)
{
	var resCount = 0;
	var totalCmdCount = 4;

	log.debug( '  diag package request');

   try {

      //hciconfig
      var hciconfigCmd = childProcess.spawn('hciconfig');

      hciconfigCmd.on('error', function(data) {
         log.warn( '  hciconfig process error (' + data + ')');
      });

      hciconfigCmd.stdout.on('data', function(data) {
         log.warn( '  hciconfig process stdout (' + data + ')');
      });

      hciconfigCmd.stderr.on('data', function(data) {
         log.warn( '  hciconfig process stderr (' + data + ')');
      });

      hciconfigCmd.on('close', function(code) {

         log.warn( '  hciconfig process exit (' + code + ')');
         resCount++;
         uploadDiag(res, resCount, totalCmdCount);
      });
   } catch(e) {

      resCount++;
      uploadDiag(res, resCount, totalCmdCount);
   }

   //lsusb
   try {

      var lsusb = childProcess.spawn('lsusb');

      lsusb.stdout.on('data', function(data) {
         log.warn( '  lsusb process stdout (' + data + ')');
      });

      lsusb.stderr.on('data', function(data) {
         log.warn( '  lsusb process stderr (' + data + ')');
      });

      lsusb.on('error', function(data) {
         log.warn( '  lsusb process error (' + data + ')');
      });

      lsusb.on('close', function(code) {

         log.warn( '  lsusb process exit (' + code + ')');
         resCount++;
         uploadDiag(res, resCount, totalCmdCount);
      });
   } catch(e) {

      resCount++;
      uploadDiag(res, resCount, totalCmdCount);
   }

   try {

      //ifconfig
      var ifconfig = childProcess.spawn('ifconfig');

      ifconfig.stdout.on('data', function(data) {
         log.warn( '  ifconfig process stdout (' + data + ')');
      });

      ifconfig.stderr.on('data', function(data) {
         log.warn( '  ifconfig process stderr (' + data + ')');
      });

      ifconfig.on('spawn', function(data) {
         log.warn( '  ifconfig process err (' + data + ')');
      });

      ifconfig.on('close', function(code) {

         log.warn( '  ifconfig process exit (' + code + ')');
         resCount++;
         uploadDiag(res, resCount, totalCmdCount);
      });
   } catch(e) {

      resCount++;
      uploadDiag(res, resCount, totalCmdCount);
   }

   try {

      //uname
      var uname = childProcess.spawn('uname', ['-a']);

      uname.stdout.on('data', function(data) {
         log.warn( '  uname process stdout (' + data + ')');
      });

      uname.stderr.on('data', function(data) {
         log.warn( '  uname process stderr (' + data + ')');
      });

      uname.on('error', function(data) {
         log.warn( '  uname process error (' + data + ')');
      });

      uname.on('close', function(code) {

         log.warn( '  uname process exit (' + code + ')');
         resCount++;
         uploadDiag(res, resCount, totalCmdCount);
      });

   } catch(e) {

      resCount++;
      uploadDiag(res, resCount, totalCmdCount);
   }
}

var uploadDiag = function(res, resCount, totalCmdCount)
{
   // processing is still not over !!
   if (resCount != totalCmdCount) {

      log.trace( '  cmd count (' + resCount + ')');
   } else {

      log.debug( '  diagnostics bundle triggered ');
      log.debug( '  version (' + version + ')');

      var now = moment();
      var time_str = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
      var fileformat = now.tz("America/New_York").format('YYYYMMDDHH:mm:ss');

      var working_dir = '/var/log/' + fileformat;
      var filename    = '/var/log/' + fileformat + '.tar.gz';

      create_work_space(res, working_dir, filename, time_str);
   }
}

var create_work_space = function(res, working_dir, filename, time_str)
{
   exec('sudo mkdir -p ' + working_dir,

      function (err, stdout, stderr) {

         if (err) {

            exec('sudo rm -rf ' + working_dir);
            log.error( '  diagnostics create workspace fail(' + err + ')');
            io.emit('diagnostic', { action: 'fail', status: "diagnostics create workspace fail" });
            res.json({success: 'false', msg:' create work space fail'});
         } else {

            log.debug(
               '  diagnostics package create work space done (' + working_dir + ')');
            cloudConnect.updateRemoteCmdStatus ('remoteDiagnostics', 'In-Progress', 'diagnostics package create work space done');
            copy_securiot_logs(res, working_dir, filename, time_str);
         }
  });
}

var copy_securiot_logs = function(res, working_dir, filename, time_str)
{
   exec('sudo cp /var/log/securiot-* ' + working_dir,

      function(err, stdout, stderr) {

         if (err) {

            exec('sudo rm -rf ' + working_dir);
            log.error( '  diagnostics copy logs to workspace fail(' + err + ')');
            io.emit('diagnostic',
               { action: 'fail', status: "  diagnostics copy logs to workspace fail"});
            res.json({success: 'false', msg:' securiot log copy fail'});
         } else {

            log.debug( 'remoteDiagnostics: services log files copied to workspace(' + working_dir + ')');
            cloudConnect.updateRemoteCmdStatus ('remoteDiagnostics', 'In-Progress', 'remoteDiagnostics: services log files copied to workspace', null);
            copy_other_logs(res, working_dir, filename, time_str);
         }
   });
}

var copy_other_logs = function(res, working_dir, filename, time_str)
{
   exec('sudo cp /var/log/messages* /var/log/kern* /var/log/syslog* ' + working_dir,

      function(err, stdout, stderr) {

         if (err) {

            exec('sudo rm -rf ' + working_dir);
            log.error( '  diagnostics copy logs to workspace fail(' + err + ')');
            io.emit('diagnostic',
               { action: 'fail', status: " diagnostics copy logs to workspace fail"});
            res.json({success: 'false', msg:' other log copy fail'});
         } else {

            log.debug( '  diagnostics package copy done (' + working_dir + ')');
            io.emit('diagnostic',
               { action: 'inProgress', status: "remoteDiagnostics: system log files copied to workspace"});
            cloudConnect.updateRemoteCmdStatus ('remoteDiagnostics', 'In-Progress', 'remoteDiagnostics: system log files copied to workspace', null);
            compress_files(res, working_dir, filename, time_str);
         }
   });
}

var compress_files = function(res, working_dir, filename, time_str)
{
   //Tarring the files in the working directory and sending to remote diag server
   exec('sudo tar -czf ' + filename + ' ' + working_dir,

      function(err, stdout, stderr) {

         // delete the working directory
         exec('sudo rm -rf ' + working_dir);

         if (err) {

            exec('sudo rm -rf ' + filename);
            log.error( '  diagnostics package compress fail(' + err + ')');
            io.emit('diagnostic',
               { action: 'fail', status: " diagnostics package compress fail"});
            res.json({success: 'false', msg:' diag bundle compression fail'});
         } else {

           log.debug( '  diagnostics package tar done (' + filename + ')');
           io.emit('diagnostic',
              { action: 'inProgress', status: "remoteDiagnostics: diag bundle is created"});
			cloudConnect.updateRemoteCmdStatus ('remoteDiagnostics', 'In-Progress', 'remoteDiagnostics: diag bundle is created', null);
			//cmd_post(res, working_dir, filename, time_str);
			cloudConnect.updateRemoteCmdStatus ('remoteDiagnostics', 'Complete', 'remoteDiagnostics: diag bundle is posted', null);
			cloudConnect.sendRemoteCmdResponse ('remoteDiagnostics', res, {success: 'true', msg:{diagBundleId: "TBD"}});
         }
   });
}

var cmd_post = function(res, working_dir, filename, time_str)
{
   log.debug( '  adding to diagnostics bundle (' + filename + ')');

   if (!USERURL || !DIAGURL) {

      exec('sudo rm -rf ' + working_dir);
      exec('sudo rm -rf ' + filename);
      log.warn( '  loginUrl/userUrl not defined');
      res.json({success: 'false', msg: ' undefined urls'});
      return;
   }

   request(USERURL + user.toString(), function (error, response, body) {

      if (error || response.statusCode != 200) {

         log.error( '  user information fetch error' + error);
         exec('sudo rm -rf ' + filename);
         res.json({success: 'false', msg:' user information fetch fail'});
      } else {

         log.debug('company-doc: ' + JSON.stringify(body));

         var companyId = JSON.parse(body).companyId;

         var URL = DIAGURL + "cassandra/diagnosticBundleUpload?insert_datetime=" + time_str +
             "&user=" + user.toString() + "&clientId=" + companyId;

         log.debug( '  diag URL:' + URL);

         var formData = {log: fs.createReadStream(filename)};

         try {
            request.post({url:URL, formData: formData},

               function optionalCallback(err, httpResponse, body) {

                  log.debug( '  deleting diag bundle (' + filename + ')');
                  exec('sudo rm -rf ' + filename);

                  if (err) {

                     log.error( '  diag bundle upload failed(' + err + ')');
                     io.emit('diagnostic', { action: 'fail', status: " diag bundle upload failed"});
                     res.json({success: 'false', msg: ' diag bundle upload fail'});
                  } else {

                     try {

                        var data = JSON.parse(body);
                     } catch (e) {

                        log.error( '  http response(' + httpResponse + ')');
                        log.error( '  response(' + body + ')');
                        io.emit('diagnostic', { action: 'fail', status: " diag bundle upload failed"});
                        res.json({success: 'false', msg: ' diag bundle upload fail'});
                     }

                     if (data) {

                        var val = JSON.parse(data);

                        if (val) {

                           log.debug( '  diag bundle upload done(' + data + ')');
                           log.debug( '  diag PIN: ' + data);

                           io.emit('diagnostic', { action: 'success', status: " PIN: " + val.pin});
                           res.json({success: 'true', msg:' PIN: ' + val.pin});
                        } else {
                           io.emit('diagnostic', { action: 'fail', status: " diag bundle upload failed"});
                           res.json({success: 'true', msg:' PIN: ' + val.pin});
                        }

                     } else {

                        io.emit('diagnostic', { action: 'fail', status: " diag bundle upload failed"});
                        res.json({success: 'true', msg:' PIN: ' + val.pin});
                     }
                 }
           });
        } catch (e) {
           exec('sudo rm -rf ' + filename);
           log.warn( '  diag upload failed(' + e + ')');
        }
      }
   });
}

var checkSystemStatus = function()
{
   checkUpTime();
   checkTemperature();
   checkRamStatus();
   checkDiskStatus();
   checkIntfStatus();
   checkBleStatus();
   checkWiFiStatus();
   checkDeviceStatus();
   checkServicesStatus();
}

module.exports.checkSystemStatus = checkSystemStatus;
module.exports.sendRemoteDiagnostics = sendRemoteDiagnostics;
