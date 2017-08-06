var Alexa = require('alexa-sdk');
var MongoClient = require('mongodb').MongoClient;
var bigdecimal = require('bigdecimal');

var YelpClient = require('./yelp');
var SpendingUtils = require('./spending-utils');

let atlas_connection_uri;
let cachedDb = null;

const RESTAURANT_FREQUENCY = 7;
const states = {
    STARTMODE: '_STARTMODE',
	SEARCHMODE: '_SEARCHMODE',
    SURPRISEMODE:'_SURPRISEMODE'
}

const SAMPLE_SEARCHES = [
    'Find me a fast-food restaurant within 5 miles for 1 person',
    'Find me a restaurant for two people for 40 dollars',
    'Find me an Indian restaurant rated 3 stars for 2 people'
]

var languageStrings = {
    'en-US': {
        'translation': {
           'WELCOME_MESSAGE':"Welcome to the MASS, good to hear from you. Please tell me what can I do for you or say help.",
           'SEARCH_MESSAGE':"Alright, let's find a restaurant for you. If you don't know how to search, say 'help' for some examples.",
           'SURPRISE_ME': "Okay, Are you ready for the surprise list. You can say yes to surprise list, or say no to quit.?",
           'HELP_MESSAGE': "MASS is an agent who can help you with your personal finances is also a scout for you to provide guidance in spending money. Now you can say: MASS set-up the budget or find restaurant. Now please tell me how I can help you. "
        }
   }
};

/*{ name: 'Haandi Indian Cuisine',
    location: '1222 W Broad St,,Falls Church,VA,22046',
    rating: 4,
    distance: 2.95772687392,
    price: '$$' },
  { name: 'Masala Indian Cuisine',
    location: '1394 Chain Bridge Rd,null,McLean,VA,22101',
    rating: 4,
    distance: 2.567505765344,
    price: '$$' }];*/

exports.handler = (event, context, callback) => {
    context.callbackWaitsForEmptyEventLoop = false;
    initializeDbConnectionThen(() => {
        var alexa = Alexa.handler(event, context, callback);
		alexa.resources = languageStrings;
        alexa.registerHandlers(newSessionHandlers, startModeHandlers, searchModeHandlers, surpriseModeHandlers);
        alexa.execute();
    });
}

const initializeDbConnectionThen = (callback) => {
    var uri = "mongodb://hackathon_team1:Hexaware123!%40#@fintech1-shard-00-00-jaiox.mongodb.net:27017,fintech1-shard-00-01-jaiox.mongodb.net:27017,fintech1-shard-00-02-jaiox.mongodb.net:27017/hackathon?ssl=true&replicaSet=FinTech1-shard-0&authSource=admin"
	
	//var uri = process.env['MONGODB_ATLAS_CLUSTER_URI'];
	if (atlas_connection_uri == null) {
        atlas_connection_uri = uri;
    }
    try {
        if (cachedDb == null) {
            console.log('Connecting to database');
            MongoClient.connect(atlas_connection_uri, function(err, db) {
                cachedDb = db;
                return callback();
            });
        } else {
            callback();
        }
    } catch (err) {
        console.log('Something went wrong with DB connection');
        console.log(err);
    }
}

// *****************************  Handler function ************************************ 

var newSessionHandlers = {

    'NewSession': function() {
        this.handler.state = states.STARTMODE;
        this.emit(':ask', `
            Welcome to mass. Good to hear from you.
            Please tell me what I can do for you or say "help".
            `,
            'If you need assistance, say "help".')
    },

    'SessionEndedRequest': function() {
        console.log('Session ended!')
        this.emit(':tell', 'Goodbye');
    }

}

var startModeHandlers = Alexa.CreateStateHandler(states.STARTMODE, {

    'NewSession': function() {
        this.handler.state = '';
        this.emit('NewSession');
    },

    'AMAZON.CancelIntent': function() {
        this.handler.state = '';
        this.emit('NewSession');
    },

    'SetUpBudgetIntent': function() {
        if (this.event.request.dialogState !== 'COMPLETED') {
            this.emit(':delegate', this.event.request.intent);
            return;
        }
        var slots = this.event.request.intent.slots
        var amount = slots.amount.value;
        var category = slots.category.value;
        console.log(slots);

        var budget = {
            amount,
            category
        }
        saveBudget(budget, (found) => {
            var verb = found ? 'updated' : 'set';

            this.emit(':ask', `
                Your monthly budget for ${category} has been ${verb} to 
                ${amount} dollars. What else can I do for you?
            `, 'Try setting your budget');
        });
    },

    'ModifyBudgetIntent': function() {
        if (this.event.request.dialogState !== 'COMPLETED') {
            this.emit(':delegate', this.event.request.intent);
            return;
        }
        var slots = this.event.request.intent.slots;
        var amount = slots.amount.value;
        var category = slots.category.value;
        console.log(slots);

        var budget = {
            amount,
            category
        }
        saveBudget(budget, (found) => {
            var verb = found ? 'updated' : 'set';

            this.emit(':ask', `
                Your monthly budget for ${category} has been ${verb} to 
                ${amount} dollars. What else can I do for you?
            `, 'Try setting your budget');
        });

    },

    'DeleteBudgetIntent': function() {
        if (this.event.request.dialogState !== 'COMPLETED') {
            this.emit(':delegate', this.event.request.intent);
            return;
        }
        var slots = this.event.request.intent.slots;
        var category = slots.category.value;
        console.log(slots);

        deleteBudget(category, (found) => {
            if (!found) {
                this.emit(':ask', 
                    `Sorry, looks like you haven't set a monthly budget for ${category} yet`,
                    `Try setting your budget for ${category}`);
            } else {
                this.emit(':ask',
                    `Your monthly budget for ${category} has been deleted`,
                    'Try setting your budget for a different category!');
            }
        });
    },

    'BudgetSummaryIntent': function() {
        if (this.event.request.dialogState !== 'COMPLETED') {
            this.emit(':delegate', this.event.request.intent);
            return;
        }
        var slots = this.event.request.intent.slots;
        var category = slots.category.value;

        getBudget(category, (budget) => {
            if (!budget) {
                this.emit(':ask',
                    `Sorry! No budget was found for ${category}.`,
                    'Please tell me what I can do for you or say "help"');
                return;
            }

            let budgetAmount = new bigdecimal.BigDecimal(budget.amount);
            SpendingUtils.getSpendingAmount(category, (spendingAmount) => {

                let remaining = budgetAmount.subtract(spendingAmount);
                let message;
                let followUp;
                if (remaining.doubleValue() == 0) {
                    message = `You're broke! You have no money left to spend for ${category}`;
                    followUp = `Try increasing your budget for ${category}`;
                } else if (remaining.doubleValue() < 0) {
                    let overspend = remaining.setScale(2, bigdecimal.RoundingMode.HALF_UP()).abs();
                    message = `Oh no! You've overspent your budget for ${category} by $${overspend}`;
                    followUp = `Try increasing your budget for ${category}`;
                } else {
                    message = `Your monthly budget is ${budgetAmount} dollars for ${category}. 
                    Your remaining balance for this month is $${remaining.toPlainString()}.`;
                    followUp = 'Let me know what else I can do for you';
                }
                console.log(`Message: ${message}`);
                console.log(`Follow-up: ${followUp}`);
                this.emit(':ask', message, followUp);

            });

        })
    },

    'SearchCriteriaIntent': function() {
        this.handler.state = states.SEARCHMODE;
        this.emitWithState('SearchCriteriaIntent');
    },

    'SessionEndedRequest': function() {
        console.log('Session ended!')
        this.emit(':tell', 'Goodbye');
    },

    'Unhandled': function() {
        console.log("UNHANDLED");
        this.emit(':ask', 'Sorry, I didn\'t get that. Try again.', 'Try setting your budget!');
    },
	
	"FindTheRestaurantIntent": function() {
        console.log('FindTheRestaurantIntent');
        this.handler.state = states.SEARCHMODE;
        this.emit(':ask', this.t("SEARCH_MESSAGE" ));

    },
    "SurpriseMeIntent": function() {
        this.handler.state = states.SURPRISEMODE;
        this.emitWithState('SurpriseIntent');
    },
  
    "AMAZON.HelpIntent": function() {
        this.emit(':ask', this.t("HELP_MESSAGE" ));
    },

});

var searchModeHandlers = Alexa.CreateStateHandler(states.SEARCHMODE, {

    'NewSession': function() {
        this.emit('NewSession');
    },

    'SearchCriteriaIntent': function() {
        let slots = this.event.request.intent.slots;
        
        if (!slots.people) {
            this.emit(':ask', "Your search was incomplete. Please try again.");
        }

        this.attributes.searchStarted = true;
        if (!slots.budget) {
            this.emitWithState('BudgetSearchIntent');
        } else {
            this.emitWithState('CustomSearchIntent');
        }

    },

    'BudgetSearchIntent': function() {
        let slots = this.event.request.intent.slots;
        let requiredParams = {
            term: slots.cuisine ? slots.cuisine.value : 'Food',
            location: 'McLean, VA' //hardcoded for now, will implement location service later
        }

        calculateRestaurantBudget((budget) => {

            if (budget == null) {
                this.handler.state = STARTMODE;
                this.attributes.searchStarted = false;
                this.emit(':ask', 'Looks like you haven\'t set your budget for restaurants yet. Please set up your monthly budget for restaurants.');
            }

            if (budget <= 0) {
                this.handler.state = STARTMODE;
                this.attributes.searchStarted = false;
                this.emit(':ask', 'Uh oh. You\'ve already spent your monthly budget for restuarants this month. Try modifying your budget.');
            }

            let optionalParams = {
                distance: slots.distance ? slots.distance.value : null,
                rating: slots.rating ? slots.rating.value : null,
                price: YelpClient.getPrice(budget, slots.people.value)
            }

            YelpClient.getRestaurantsByAdditionalParams(requiredParams, optionalParams, (restaurants) => {

                if (!restaurants || !restaurants.length) {
                    this.handler.state = STARTMODE;
                    this.attributes.searchStarted = false;
                    this.emit(':ask', 'Sorry, we couldn\'t find a restaurant within your budget. Try broadening your search.');
                }

                this.attributes.currentRestaurantInd = 0;
                this.attributes.allRestaurants = restaurants;
                let message = getResponseMessage(restaurants,this.attributes.currentRestaurantInd);
                this.emit(':ask', message);

            });

        });







    },

    'CustomSearchIntent': function() {
        let slots = this.event.request.intent.slots;
        let requiredParams = {
            term: slots.cuisine ? slots.cuisine.value : 'Food',
            location: 'McLean, VA' //hardcoded for now, will implement location service later
        }

        let optionalParams = {
            distance: slots.distance ? slots.distance.value : null,
            rating: slots.rating ? slots.rating.value : null,
            price: YelpClient.getPrice(slots.budget.value, slots.people.value)
        }
        console.log('Custom Search Intent');
        console.log('Required Params:',requiredParams);
        console.log('Optional Params')
        YelpClient.getRestaurantsByAdditionalParams(requiredParams, optionalParams, (restaurants) => {

            if (!restaurants || !restaurants.length) {
                this.handler.state = STARTMODE;
                this.attributes.searchStarted = false;
                this.emit(':ask', 'Sorry, we couldn\'t find a restaurant within your budget. Try broadening your search.');
            }

            this.attributes.currentRestaurantInd = 0;
            this.attributes.allRestaurants = restaurants;
            let message = getResponseMessage(restaurants,this.attributes.currentRestaurantInd);
            this.emit(':ask', message);

        });


    },








    /*'SearchCriteriaIntent':function (){
     var slots = this.event.request.intent.slots;
     let category = slots.category ? slots.category.value : null;
     let budget = slots.budget ? slots.budget.value : null;
     let people = slots.people ? slots.people.value : null;
     let distance = slots.distance ? slots.distance.value : null;
     let rating  = slots.rating ? slots.rating.value : null;
     let price = slots.price ? slots.price.value : null;
     let message;
        if(!slots.budget){
             message =   `Let’s find a restaurant for you. Please tell me if you would prefer an option based on your 
                defined budget or tell me how much you want to spend per person? Please say Budget or 
                the amount per person you want to spend.`

        }else{
            let budgetAmount =parseInt(budget);
            let remaining=0;
            SpendingUtils.getSpendingAmount('restaurants', (spendingAmount) => {
            console.log(spendingAmount);
             remaining = parseInt(budgetAmount) -parseInt(spendingAmount);
            console.log('budgetAmount',budgetAmount);
            console.log('spendingAmount',spendingAmount);
                });
            console.log('remaining ',remaining);
            
            if(remaining <= 0){
                console.log('set up the budget',remaining);
                 this.state =states.STARTMODE;
                this.emitWithState('BudgetSummary',category);  
            } else if (remaining > 0 &&  people==null){
                console.log('ask no of people');
                message =`For how many people, you are planning to pay for?`
            }else if (remaining > 0 &&  people!=null  && rating ==null){//add distance
                console.log('check the budget',remaining);
                message =`Great. I have got couple of options for you. 
                But before that I want to tell you that you can also give me preferences for cuisine,
                 distance or ratings.`
            }else if( rating !=null ){
                this.state =states.SEARCHMODE;
                this.emitWithState('FindTheRestaurantIntent');  
            }
            else
            {
                message ='Sorry, I could not find an option under your budget. Please tell me what can I do for you or say help.';
            };

        };
        console.log(message);
        this.emit(':tell',message);

},

    'FindTheRestaurantIntent': function (){
       var slots = this.event.request.intent.slots;
       let message;
       console.log('category',slots.category.value);
       var additional_params={
        'distance': slots.distance ? slots.distance.value : null,
        'rating': slots.rating ? slots.rating.value : null,
        'price': slots.price ? slots.price.value : null
        };
        var required_params = {            
            'term': 'food',
            'location':slots.location ? slots.location.value : 'mclean, va'
        };
        
        YelpClient.getRestaurantsByAdditionalParams(required_params, (allRestaurants) => {
            if(!allRestaurants){     
                console.log('No options');
                message=`Sorry, I could not find an option under your budget. Please tell me what can I do for you or say help.`;  
            }
            else{
                console.log('SearchIntent',allRestaurants.length);
                this.attributes.currentRestaurantInd=0;
                message =getResponseMessage(this.attributes.allRestaurants,this.attributes.currentRestaurantInd); 
                
            };
            console.log('restaurant: ',message); 
            this.emit(':ask',message);
        });

        

    },*/
    'AMAZON.YesIntent': function() { 
        if (this.attributes.searchStarted) {
            this.handler.state = '';
            this.attributes.allRestaurants=[];
            this.attributes.currentRestaurantInd=null;
            this.emit(':tell',`Bingo. Thanks for using MASS. Good Bye.`);  
        } else {
            this.emitWithState('Unhandled');
        }
      },
      'AMAZON.NoIntent': function() {
        if (this.attributes.searchStarted) {
            console.log('No intent',this.attributes.allRestaurants);
            this.attributes.currentRestaurantInd= this.attributes.currentRestaurantInd+1; 
            let message = getResponseMessage(this.attributes.allRestaurants,this.attributes.currentRestaurantInd); 
            this.emit(':ask',message);
        } else {
            this.emitWithState('Unhandled');
        }
      },
      'AMAZON.NextIntent': function() { 
        if (this.attributes.searchStarted && 
            this.attributes.allRestaurants[this.attributes.currentRestaurantInd+1]) {
            this.attributes.currentRestaurantInd= this.attributes.currentRestaurantInd+1;  
            let message =  getResponseMessage(this.attributes.allRestaurants,this.attributes.currentRestaurantInd); 
            this.emit(':ask',message);
        } else if (this.attributes.searchStarted &&
            !this.attributes.allRestaurants[this.attributes.currentRestaurantInd+1]) {
            this.emit(':ask', 'We don\'t have any more suggestions for you. Say previous to go back to last'
            + 'suggestion or cancel if you want to start a new search');
        } else {
            this.emitWithState('Unhandled');
        }
      },
      'AMAZON.PreviousIntent': function() {
        if (this.attributes.searchStarted &&
            this.attributes.allRestaurants[this.attributes.currentRestaurantInd-1]) {
            this.attributes.currentRestaurantInd= this.attributes.currentRestaurantInd-1;  
            let message =  getResponseMessage(this.attributes.allRestaurants,this.attributes.currentRestaurantInd); 
            this.emit(':ask',message);
        } else if (this.attributes.searchStarted &&
            !this.attributes.allRestaurants[this.attributes.currentRestaurantInd-1]) {
            this.emit(':ask', 'You\'ve reached the beginning of the list. Say "next" to go to the next suggestion');
        } else {
            this.emitWithState('Unhandled');
        }
      },
   
    'AMAZON.CancelIntent': function() {
        this.attributes.searchStarted = false;
        this.handler.state = '';
        this.attributes.allRestaurants=[];
        this.attributes.currentRestaurantInd=null;
        this.emit('NewSession');
    },
    'AMAZON.StopIntent': function () {
        this.attributes.searchStarted = false;
        this.handler.state = '';
        this.attributes.allRestaurants=[];
        this.attributes.currentRestaurantInd=null;
        this.emit(':tell', 'Goodbye' );

    },

    'AMAZON.HelpIntent': function () {  
       this.emit(':ask', `Try saying "${SAMPLE_SEARCHES[parseInt(Math.random()*SAMPLE_SEARCHES.length)]}"`);

    },
    
    'SessionEndedRequest': function() {
        console.log('Session ended!')
        this.emit(':tell', 'Goodbye');
    },

    'Unhandled': function() {
        console.log("UNHANDLED");
        this.emit(':ask', 'Sorry, I did not understand. Please tell me what can I do for you or say help.');
    }

});
var surpriseModeHandlers = Alexa.CreateStateHandler(states.SURPRISEMODE, {

      'NewSession': function() {
        this.emit('NewSession');
    },

    'SurpriseIntent': function (){
       console.log('SurpriseIntent--');
       //let category = this.event.request.intent.slots.category.value;

       SpendingUtils.getFavouritePlace('restaurants', (favouritePlace) => {
           console.log("Favourite place: " + favouritePlace);
        let message ;
        if(favouritePlace!=null){
           console.log("hey, it's not null");
        var requiredParams = { term: favouritePlace, location: 'Mclean,VA' };//

        YelpClient.getRestaurantsByrequiredParams(requiredParams,(allRestaurants) => {
            
            if (!allRestaurants || !allRestaurants.length) {
                this.handler.state = states.STARTMODE;
                this.emit(':ask', `Sorry, Mass doesn't have enough information to surprise you.`,`Try searching for a restaurant`);
            }
            this.attributes.currentRestaurantInd = 0;
            message = getResponseMessage(allRestaurants,this.attributes.currentRestaurantInd); 
            this.emit(':ask',message); 
        });
        
        }
        else{
            console.log('else');
            message=HELP_MESSAGE;
            this.emit(':ask', message);
        };
           
       
        });
         
    },
   'AMAZON.YesIntent': function() { 
        this.handler.state = '';
        this.attributes.allRestaurants=[];
        this.emit(':tell',`Bingo. Thanks for using MASS. Good Bye.`);  
      },
     'AMAZON.NoIntent': function() {
        this.handler.state = '';
        this.emit(':tell', 'Okay, Please search again, goodbye!');
    },

    'AMAZON.CancelIntent': function() {
        this.handler.state = '';
        this.emit('NewSession');
    },
    'AMAZON.StopIntent': function () {
        this.emit(':tell', 'Goodbye' );
    },

    'AMAZON.HelpIntent': function () {  
       this.emit(':ask', "HELP_MESSAGE");
    },
    
    'SessionEndedRequest': function() {
        console.log('Session ended!')
        this.emit(':tell', 'Goodbye');
    },

    'Unhandled': function() {
        console.log("UNHANDLED");
        this.emit(':ask', 'Sorry, I did not understand. Please tell me what can I do for you or say help.', 'Seach again!');
    }

});

// *********************  Helper function *******************************************

var saveBudget = (budget, callback) => {
    var budgetCollection = cachedDb.collection("budget");
    budgetCollection.findOne({category: budget.category}, (err, doc) => {
        var found = false;
        if (doc) {
            budget["_id"] = doc["_id"];
            found = true;
        }
        budgetCollection.save(budget, () => {
            console.log('Budget was saved: ' + budget);
            return callback(found);
        });
    });
    
}

var deleteBudget = (category, callback) => {
    var budgetCollection = cachedDb.collection('budget');
    budgetCollection.remove({category: category}, {w: 1}, function(err, res) {
        var found = true;
        if (err) {
            console.log(err);
        }
        if (res < 1) {
            found = false;
        }
        return callback(found);
    });
}

var getBudget = (category, callback) => {
    var budgetCollection = cachedDb.collection('budget');
    budgetCollection.findOne({category: category}, (err, doc) => {
        return callback(doc);
    });
}

var calculateRestaurantBudget = (callback) => {
    getBudget('restaurants', (budget) => {
        if (!budget) {
            budget = null;
            callback(budget);
        } else {
            SpendingUtils.getSpendingAmount('restaurants', (spendingAmount) => {
                spendingAmount = spendingAmount.doubleValue();
                let remaining = budget.amount - spendingAmount;
                let remainingDays = getRemainingDaysInMonth();
                if (remainingDays <= RESTAURANT_FREQUENCY) {
                    callback(remaining);
                } else {
                    let remainingVisits = parseInt(remainingDays/RESTAURANT_FREQUENCY);
                    remaining = (remaining/remainingVisits).toFixed(2);
                    callback(remaining);
                }
            })
        }
    });
}

var getRemainingDaysInMonth = () => {
    let now = new Date();
    let totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let currentDay = now.getDate();
    return totalDaysInMonth - currentDay;
}

//----------------------Restaurant Function----------------------

let getResponseMessage=(data,i)=>{

let  message =`okay. How about ${data[i].name}  located at ${data[i].location}.
                 Their rating is ${data[i].rating} stars.
                 Price range for one person would be ${getPriceRange(data[i].price)} dollars. 
                 Does this work for you? Or say Repeat.`

 console.log('getResponseMessage',message);
  return message; 
}

let getPriceRange=(symbol)=>{
  console.log('Inside getPrice.');
  if (symbol =="$"){
    return "Under 10";
  }else if (symbol =="$$" ){
    return "between 11 and 30 ";
  }
  else if (symbol =="$$$"){
    return "between 31 and 60";
  }
  else if (symbol =="$$$$"){
    return "greater than 60";
  };
  return null;
}
