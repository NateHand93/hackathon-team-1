'use strict';

var yelp = require('yelp-fusion');
var _ = require('lodash');
var bigdecimal = require('bigdecimal');
<<<<<<< HEAD
var yelpClient={};
=======
var SpendingUtils = require('./spending-utils');
const clientId = 'IOi-_0QBEv1UQx2vrr8TYg'; //process.env["SPENDING_CLIENT_ID"];
const clientSecret = 'RW40zUADkLsO08M5qjAfZ3BnqM8hXEtRp3kcgVl6PPvs4dwoJoOfEEe9kolpDi9j';//process.env["SPENDING_CLIENT_SECRET"];
const yelpClient={};
>>>>>>> 8ad424e0dff47379aed7188f3b0d26f38b876210
global.restaurentList = [];

yelpClient.getRestaurantsByrequiredParams=(requiredParams)=>{
 
yelp.accessToken(clientId, clientSecret).then(response => {
  var client = yelp.client(response.jsonBody.access_token);
   client.search(requiredParams).then(response => {
    var b = response.jsonBody.businesses;
    var convertedJson = JSON.stringify(b);
    var obj = JSON.parse(convertedJson);
    return parseResponse(obj);
  });
}).catch(e => {
  console.log(e);
  return e;
});
}

let  parseResponse=(restaurants)=> {
{
 for(var i = 0; i < restaurants.length;i++){
     var  restaurant ={'name':restaurants[i].name,'location':getAddress(restaurants[i].location),'rating':restaurants[i].rating,'distance':getMiles(restaurants[i].distance),'price':restaurants[i].price,};
      global.restaurentList.push(restaurant);      
  }
  var list = global.restaurentList?global.restaurentList:null; 
  console.log('list:',list);
  return list ;
}
}

yelpClient.getRestaurantsByAdditionalParams=(params,additionalParams)=>{

  var all = yelpClient.getRestaurantsByrequiredParams(params);
  console.log(all);
       var list = findByGivenParams(additionalParams,all);
       console.log(list.length);
      return list
}

let findByGivenParams=(params,restaurants)=>{
  var result = _.filter(restaurants,buildParams(params));
  console.log('result:',result.length);

  var finalResult = result? result:null;  
  return finalResult;
}
 
let buildParams = (params) => {
  var parameters = new Object();
  var price;
  if(params.price ==null && (params.budgetAmount != null && params.peopleCount !=null)){
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

  let  getPrice=(budgetAmount,peopleCount)=>{
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
}

//yelpClient.
let getPriceRange=(symbol)=>{
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
}

let getMeters=(i)=> {
  console.log('getMeters');
     return i/0.000621371192;
}

let getMiles=(i)=> {
  console.log('getMiles');
     return parseInt(i)*0.000621371192;
}

 let getAddress=(addressObject)=>{
   return (addressObject.address1+','+addressObject.address2+','+addressObject.city+','+addressObject.state+','+ addressObject.zip_code);
}

module.exports=yelpClient
