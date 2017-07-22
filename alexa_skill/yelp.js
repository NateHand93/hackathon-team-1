'use strict';

var yelp = require('yelp-fusion');
var _ = require('lodash');
var bigdecimal = require('bigdecimal');
var yelpClient={};
global.restaurentList = [];
function getAllRestaurants(requiredParams,additionalParams){
  var clientId = 'IOi-_0QBEv1UQx2vrr8TYg';
  var clientSecret = 'RW40zUADkLsO08M5qjAfZ3BnqM8hXEtRp3kcgVl6PPvs4dwoJoOfEEe9kolpDi9j';

 
yelp.accessToken(clientId, clientSecret).then(response => {
  var client = yelp.client(response.jsonBody.access_token);
  client.search(requiredParams).then(response => {
    var firstResult = response.jsonBody.businesses;
    var prettyJson = JSON.stringify(firstResult);
    var obj = JSON.parse(prettyJson);
   
    return parseResponse(obj,additionalParams);
  });
}).catch(e => {
  console.log(e);
  return e;
});
}

function parseResponse(restaurants,params)
{
 for(var i = 0; i < restaurants.length;i++){
      var  restaurant ={'name':restaurants[i].name,'location':restaurants[i].location,'rating':restaurants[i].rating,'distance':restaurants[i].distance,'price':restaurants[i].price,};
      global.restaurentList.push(restaurant);      
  }
  var list = global.restaurentList?global.restaurentList:"No restaurants"; 
  console.log('list:',list.length);
  if(params)
    {
     var list = findByGivenParams(params);
      
    }
  return list ;
}

function findByGivenParams(params){
  var result = _.filter(global.restaurentList,buildParams(params));
  console.log('result:',result.length);
  var finalResult = result? result:null;  
  return finalResult;
}

 
function buildParams(params){
  var parameters = new Object();
  var price = getPrice(params.budgetAmount,params.peopleCount);
 
  if(price){
    parameters.price = price;
  };
   if(params.rating){
    parameters.rating=params.rating;
  };
   if(params.distance){
     var distanceInMeters = new bigdecimal.BigDecimal(distance) ;
     parameters.distance = getMiles(distanceInMeters);
  };
  return JSON.parse(JSON.stringify(parameters));
}
  function getPrice(budgetAmount,peopleCount){
  console.log('Inside getPrice.');
  var averageCost = parseInt(budgetAmount/peopleCount);
  if (parseInt(averageCost) <=10){
    return "$";
  }else if (parseInt(averageCost) <=11 && parseInt(averageCost) <=30 ){
    return "$$";
  }
  else if (parseInt(averageCost) <=31 && parseInt(averageCost) <=60 ){
    return "$$$";
  }
  else if (parseInt(averageCost) >60){
    return "$$$$";
  };
  return null;
};

function getPriceRange(symbol){
  console.log('Inside getPrice.');
  
  if (symbol =="$"){
    return "Under 10";
  }else if (symbol =="$$" ){
    return "between 11 to 30 ";
  }
  else if (symbol =="$$$"){
    return "between 31 to 60";
  }
  else if (symbol =="$$$$"){
    return "greater than 60";
  };
  return null;
};
function getMiles(i) {
     return i*0.000621371192;
};
function getAvailableBalance(){

  
}

yelpClient.getAllRestaurants=getAllRestaurants;
yelpClient.getPriceRange=getPriceRange;
module.exports=yelpClient
