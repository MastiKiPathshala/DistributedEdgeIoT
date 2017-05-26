var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/:page', function(req, res, next) {
 
   var upgrade = false, config = false;


   switch(req.params.page){
 
   	case 'dashboard.html':
   	config = true;
   	upgrade = true;
   	break;
 
   	case 'softwareupgrade.html':
   	config = true;
   	upgrade = true;
   	break;
 
   	case 'diagnostics.html':
   	config = true;
   	upgrade = true;
   	break;
 
   	case 'restart.html':
   	config = true;
   	upgrade = true;
   	break;
 
   }

   res.locals = {
	   config:config,upgrade:upgrade
   };


  	res.render(req.params.page, { title: 'Express',partials: {sidebar:'sidebar',head:'head'} });
});

module.exports = router;
