'use strict';

var yelp = require('yelp-fusion');
var _ = require('lodash');
var bigdecimal = require('bigdecimal');

var yelpClient={};
global.restaurentList = [];
function getRestaurantsByrequiredParams(requiredParams){
  var clientId = 'IOi-_0QBEv1UQx2vrr8TYg';
  var clientSecret = 'RW40zUADkLsO08M5qjAfZ3BnqM8hXEtRp3kcgVl6PPvs4dwoJoOfEEe9kolpDi9j';

 console.log("requiredParams",requiredParams);
yelp.accessToken(clientId, clientSecret).then(response => {
  var client = yelp.client(response.jsonBody.access_token);
   client.search(requiredParams).then(response => {
    console.log(response.jsonBody);
    var b = response.jsonBody.businesses;
    var convertedJson = JSON.stringify(b);
    var obj = JSON.parse(convertedJson);
   console.log(convertedJson);
    return parseResponse(obj);
  });
}).catch(e => {
  console.log(e);
  return e;
});
}

function getRestaurantsByAdditionalParams(params,additionalParams){

  var all = getRestaurantsByrequiredParams(params);
  console.log(all);
       var list = findByGivenParams(additionalParams,all);
       console.log(list.length);
      return list
}

function parseResponse(restaurants)
{
 for(var i = 0; i < restaurants.length;i++){
      var  restaurant ={'name':restaurants[i].name,'location':restaurants[i].location,'rating':restaurants[i].rating,'distance':restaurants[i].distance,'price':restaurants[i].price,};
      global.restaurentList.push(restaurant);      
  }
  var list = global.restaurentList?global.restaurentList:null; 
  console.log('list:',list.length);
  return list ;
}

function findByGivenParams(params,restaurants){
  var result = _.filter(restaurants,buildParams(params));
  console.log('result:',result.length);

  var finalResult = result? result:null;  
  return finalResult;
}

 
function buildParams(params){
  var parameters = new Object();
  var price;
  if(params.price ==null){
   price = getPrice(params.budgetAmount,params.peopleCount);
    }else{ 
    price =params.price};
 
  if(price){
    parameters.price = price;
  };
   if(params.rating){
    parameters.rating=params.rating;
  };
   if(params.distance){
     var distanceInMiles = new bigdecimal.BigDecimal(params.distance) ;
     parameters.distance = getMeters(distanceInMiles);
  };
  console.log('parameters : ',parameters);
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
function getMeters(i) {
  console.log('getMeters');
     return i/0.000621371192;
};
function getAvailableBalance(){

  
}

yelpClient.getRestaurantsByrequiredParams=getRestaurantsByrequiredParams;
yelpClient.getRestaurantsByAdditionalParams=getRestaurantsByAdditionalParams;
yelpClient.getPriceRange=getPriceRange;
module.exports=yelpClient
