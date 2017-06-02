//Globals
var user      = {};
var locations = {};

var getDeviceName = function(cb)
{
   var get_url = '/api/config/devName';
   $.ajax({

      method: "GET",
      url: get_url
   }).done(function(data) {

      console.log('devName:');
      console.log(data);
      cb(data.devName);

   }).fail(function(data) {

      console.log(data);
      cb();
   });
}

var validateDeviceInfo = function()
{
   getDeviceName(function(devName) {

      console.log('Device Id: ' + devName);

      // if (devName != "SIOT-ABCDEFGHIJ-YY-XXXXX")
      if (devName === undefined) {

         var devName = prompt('Please enter device name: ', 'SIOT-');

         if (devName == null) {

            window.location.reload();
         } else if (devName.search(/SIOT[-/]\c{10}[-/]\d{2}[-/]\d{5}$/) >= 0) {

            var post_url = '/api/config/devName';
            //send to server
            $.ajax({

               method: "POST",
               url: post_url,
               data: {'devName': devName}
            }).done(function() {

               window.location.reload();
            }).fail(function() {

               window.location.reload();
            });

         } else {
            window.location.reload();
         }
      }
   });
}

//Init function of login page
var loginInit = function()
{
   // validateDeviceInfo(); TBD-XXX

   var userDoc = window.localStorage.getItem('user');

   if (userDoc === null) {

      window.localStorage.removeItem('user');
      window.location.href = "index.html";

   } else {
      login('dashboard.html');
   }
}

var login = function(destination)
{
   var userName;
   var passWord;

   if (!jQuery.isEmptyObject(user)) {

      userName = user._id;
      passWord = user.passWord;
   } else {

      userName = $("#userName").val();
      passWord = $("#passWord").val();
   }

   var loginData = {userName: userName, passWord: passWord};
   var post_url = '/api/config/user';

   //Perform User Fetch
   $.ajax({

      type: 'POST',
      url: post_url,
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify(loginData)
   }).done(function(data) {

      console.log('post-login-data: ' );
      console.log(data);

      if (data.success === true) {
         loginHandler(userName, passWord, destination);
      } else {
         window.location.reload();
      }
   });
}

var loginHandler = function(userName, passWord, destination)
{
   var get_url = '/api/config/user/';

   $.ajax({

      method: 'GET',
      url: get_url
   }).done(function(data) {

      console.log('login-data:' + data)

      var userDoc = data;
      delete userDoc._rev;

      //clean up localstorage information
      window.localStorage.removeItem('user');

      if (!userDoc) {

         console.log('invalid user data');
         window.location.href = "index.html";
         return;
      }

      //store user data in local storage
      window.localStorage.setItem('user', JSON.stringify(userDoc));

      get_url = '/api/config/location/';

      $.ajax({

         method: 'GET',
         url: get_url
      }).done(function(locData) {

         console.log('loc-data: ' + locData);

         window.localStorage.setItem('location', JSON.stringify(locData));

         var post_url = '/api/config/refresh';

         $.ajax({

            method: 'POST',
            url: post_url
         }).done(function(data) {

            if (data.success) {
                window.location.href = destination;
            }
         });
      }).fail(function(locData) {
         var post_url = '/api/config/refresh';

         $.ajax({

            method: 'POST',
            url: post_url
         }).done(function(data) {

            if (data.success) {
                window.location.href = destination;
            }
         });
      });
   });
}

var logout = function()
{
   window.localStorage.removeItem('user');
   window.localStorage.removeItem('location');

   // point to login page
   window.location.href = "index.html";
}

var showUser = function()
{
   var user = JSON.parse(window.localStorage.getItem('user'));
   var loc  = JSON.parse(window.localStorage.getItem('location'));

   console.log('user: ' + user);
   console.log('GPS location: ' + loc);

   if (user) {
      $("#user").text(user.id);
   }

   // get location
   if (loc && loc != undefined) {

      var locString = loc.city + ',' + loc.state + ',' + loc.country;
      var get_url = 'http://maps.google.com/maps/api/geocode/json?address=' + locString + '&sensor=false';

      $.ajax({
         method: 'GET',
         url: get_url
      }).done(function(data) {

         // take some default, to start with
         var pos = { lat: 12.963778, lng: 77.712111 };

         if (data.status === 'OK') {
            pos = { lat: data.results[0].geometry.loc.lat, lng: data.results[0].geometry.loc.lng };
         }

         var map = new google.maps.Map(document.getElementById('map'), { zoom: 5, center: pos});

         var marker = new google.maps.Marker({ position: pos, map: map });
      });
   }
}

var getLatestSwVersion = function()
{
   var get_url = 'api/config/latestSwVersionId'

   document.getElementById("swVersionBtn").style.display = 'none';

   $.ajax({

      method: 'POST',
      url: get_url
   }).done(function(data) {

      $('#latestSwVersionId').text(data.latestSwVersionId);
   });

   socket = io.connect(window.location.origin, {
        'reconnect': true,
        'reconnection delay': 500,
        'max reconnection attempts': 10000});

   socket.on('swVersionId',function(data) {

      if (data.status === 'fetching') {

         $("#latestSwVersionId").text('fetching latest version information');
      }
   });
}

var validateUser = function()
{
   if (window.localStorage.getItem('user') === null) {

      window.location.href = "index.html";
      return;
   }
   showUser();
}

var hostNameUpdate = function()
{
   $.ajax({

       method: 'POST',
       url: 'api/config/hostName',
       data: { hostname: $('#hostName').val() }
   }).done(function(data) {

      if (data.success) {

         alert('host name updated')
         window.location.reload();
      } else {

         alert('failed')
         window.location.reload();
      }
   });
}

var softwareUpgradeConfirm = function()
{
   var get_url = '/api/upgrade/';
   var upgradeSwVersionId = $('#upgradeSwVersionId').val();

   console.log('upgrade to ' + upgradeSwVersionId);

   $("#softwareUpgradeBtn").attr("disabled","true");

   $.ajax({

      method:'GET',
      url:get_url
   }).done(function(data) {

      if (data.success != 0) {
          alert('a software upgrade is currently in progress...');
          return;
      }

      $("#softwareUpgradeBtn").text('upgrading...');

      var post_url = '/api/upgrade/' + upgradeSwVersionId;

      $.ajax({
         method: 'POST',
         url: post_url
      }).done(function() {

         console.log(upgradeSwVersionId + ' software upgrade done!');;

         $("#softwareUpgradeBtn").text('upgrading software...');

      }).fail(function() {

         alert('software upgrade to ' + upgradeSwVersionId + ' failed!');
      });

   }).fail(function() {

      alert('upgrade status get failed!');
   });
}

// restart the datahub services
var softwareRestartConfirm = function()
{
   var post_url = '/api/config/serviceRestart';
   $.ajax({

      method: 'POST',
      url: post_url
   }).done(function(data) {

      if (!data.success) {

         alert('software restart failed');
         return;
      } else {

         alert('software restart done');
      }

      setTimeout(function() {

         login('dashboard.html');
      }, 3000);

   }).fail(function() {

      alert('software restart failed');
   });
}

var hardwareRestartConfirm = function()
{
   var post_url = '/api/config/hardwareRestart';

   $.ajax({

       method: 'POST',
       url: post_url
   }).done(function() {

      console.log("system restart done!");
      alert('system restart done!');

      setTimeout(function() {

         login('dashboard.html');
      }, 60000);
   });
}

var updateInit = function()
{
   var get_url = '/api/config/swVersionId';
   var hwInfo;
   var swInfo;

   $.ajax({
      method: 'GET',
      url: get_url
   }).done(function(data) {
      $("#swVersionId").text(data.swVersionId);
   });

   var get_url = '/api/config/hwVersionId';
   $.ajax({
      method: 'GET',
      url: get_url
   }).done(function(data) {
      $("#hwVersionId1").text(data.hwVersionId);
   });

   var get_url = '/api/config/hwDesc';
   $.ajax({
      method: 'GET',
      url: get_url
   }).done(function(data) {
      $("#hwDescription").text(data.hWDesc);
   });

   var get_url = '/api/config/kernelVersion';
   $.ajax({
       method: 'GET',
       url: get_url
   }).done(function(data) {
       $("#kernelVersion").text(data.kernelVersion);
   });

   var get_url = '/api/config/fwVersion';
   $.ajax({
      method: 'GET',
      url: get_url
   }).done(function(data) {
      $("#firmwareVersion").text(data.fwVersion);
   });

   var get_url = '/api/config/wlanMacAddr';
   $.ajax({
      method: 'GET',
      url: get_url
   }).done(function(data) {
      $("#wlanMacAddr").text(data.wlanMacAddr);
   });

   var get_url = '/api/config/ethMacAddr';
   $.ajax({
      method: 'GET',
      url: get_url
   }).done(function(data) {
      $("#ethMacAddr").text(data.ethMacAddr);
   });


   hwInfo = "<div class='panel panel-color panel-primary'> \
            <div class='panel-heading'> \
            <h3 class='panel-title'>Hardware Information</h3>\
            </div> </div>";

   $("#hwInfo").append(hwInfo);

   swInfo = "<div class='panel panel-color panel-primary'> \
            <div class='panel-heading'> \
            <h3 class='panel-title'>Software Information</h3>\
            </div></div>";
   $("#swInfo").append(swInfo);

   var get_url = '/api/upgrade/';

   $.ajax({

      method:'GET',
      url:get_url
   }).done(function(data){

      if (data.success) {

         $("#softwareUpgradeBtn").removeAttr('disabled');
      } else {

         $("#softwareUpgradeBtn").text('Updating');
         $("#softwareUpgradeBtn").attr("disabled","true")
      }
   });

   socket = io.connect(window.location.origin, {
             'reconnect': true,
             'reconnection delay': 500,
             'max reconnection attempts': 10000});

   socket.on('update',function(data) {

      $('#updateStats').text(data.status);

      if (data.status === "failed") {
          $('#updateStats').append('...');
          $("#softwareUpgradeBtn").removeAttr('disabled');
          setTimeout(function(){window.location.reload()},5000);
      }

      if (data.status === "complete"){
          $('#updateStats').append('...reloading.')
          $("#softwareUpgradeBtn").removeAttr('disabled');
          setTimeout(function(){window.location.reload()},20000);
      }
   });
}

var setLogLevel = function (logSettings)
{
   var post_url = '/api/config/logLevel';

   $.ajax({

      method:'POST',
      url:post_url,
      data:{level:$('#logLevel_' + which).val(), which: logSettings}
   }).done(function() {

      alert('done');
   }).fail(function() {

      alert('set log level failed');
   });
}
