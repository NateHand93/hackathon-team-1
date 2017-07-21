var Alexa = require('alexa-sdk');
var MongoClient = require('mongodb').MongoClient;
var bigdecimal = require('bigdecimal');

var YelpClient = require('./yelp');
var SpendingUtils = require('./spending-utils');

let atlas_connection_uri;
let cachedDb = null;

const states = {
    STARTMODE: '_STARTMODE',
    SETBUDGETMODE: '_SETBUDGETMODE',
    GETBUDGETMODE: '_GETBUDGETMODE',
	SEARCHMODE: '_SEARCHMODE',
    SURPRISEMODE:'_SURPRISEMODE'
}

var languageStrings = {
    'en-US': {
        'translation': {
           'WELCOME_MESSAGE':"Welcome to the MASS, good to hear from you. Please tell me what can I do for you or say help.",
           'SEARCH_MESSAGE':"Say  restaurant name and budget",
           'SURPRISE_ME': "Okay, Are you ready for the surprise list. You can say yes to surprise list, or say no to quit.?",
           'HELP_MESSAGE': "MASS is an agent who can help you with your personal finances is also a scout for you to provide guidance in spending money. Now you can say: MASS set-up the budget or find restaurant. Now please tell me how I can help you. "
        }
   }
};
global.currentRestaurantInd=0;

global.allRestaurants=[];
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

    'SetUpBudget': function() {
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

    'ModifyBudget': function() {
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

    'DeleteBudget': function() {
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

    'BudgetSummary': function() {
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
                    message = `You have set your budget to ${budgetAmount} dollars for ${category}. 
                    Your remaining balance for this month is $${remaining.toPlainString()}.`;
                    followUp = 'Let me know what else I can do for you';
                }
                this.emit(':ask', message, followUp);

            });

        })
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
        this.emit(':ask', this.t("SURPRISE_ME"));
    },
  
    "AMAZON.HelpIntent": function() {
        this.emit(':ask', this.t("HELP_MESSAGE" ));
    },

});

var searchModeHandlers = Alexa.CreateStateHandler(states.SEARCHMODE, {

      'NewSession': function() {
        this.emit('NewSession');
    },

    'searchCriteriaIntent':function (){
     var slots = this.event.request.intent.slots;
     let category = slots.category.value;
     let budget = slots.budget.value;
     let people = slots.people.value;
    // let distance =slots.distance.value;
     let rating  =slots.rating.value;
    // let price = slots.price.value;
     let message
        if(slots.budget.value ==null){
             message =   `Let’s find a restaurant for you. Please tell me if you would prefer an option based on your 
                defined budget or tell me how much you want to spend per person? Please say Budget or 
                the amount per person you want to spend.`

        }else{
            let budgetAmount =parseInt(budget);
            let remaining=0;
             SpendingUtils.getSpendingAmount(category, (spendingAmount) => {
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
       let  message;
       console.log('category',slots.category.value);
       var additional_params={
        budgetAmount:slots.budget.value,
       // distance:slots.distance.value,
        'rating':4,
        'price':slots.price.value
        };
        var required_params = {            
            'term': slots.category.value,
            'location':slots.location.value
        };
        
        //allRestaurants= YelpClient.getRestaurantsByAdditionalParams(required_params,additional_params); //commented for tessting
       
        if(allRestaurants=='undefined' || additional_params==null){     
            console.log('No options');
            message=`Sorry, I could not find an option under your budget. Please tell me what can I do for you or say help.`;  
        }
        else{
            console.log('SearchIntent',allRestaurants.length);
            currentRestaurantInd=0;
            message =getResponseMessage(allRestaurants,currentRestaurantInd); 
            
        };
        console.log('restaurant: ',message); 
        this.emit(':tell',message);

    },
    'AMAZON.YesIntent': function() { 
        this.handler.state = '';
        allRestaurants=[];
        currentRestaurantInd=null;
        this.emit(':tell',`Bingo. Thanks for using MASS. Good Bye.`);  
      },
      'AMAZON.NoIntent': function() { 
        console.log('No intent',allRestaurants);
        currentRestaurantInd= currentRestaurantInd+1; 
        let message = getResponseMessage(allRestaurants,currentRestaurantInd); 
        this.emit(':tell',message);
      },
      'AMAZON.NextIntent': function() { 
        currentRestaurantInd= currentRestaurantInd+1;  
        let message =  getResponseMessage(allRestaurants,currentRestaurantInd); 
        this.emit(':tell',message);  
      },
      'AMAZON.PreviousIntent': function() { 
        currentRestaurantInd= currentRestaurantInd-1;  
        let message =  getResponseMessage(allRestaurants,currentRestaurantInd); 
        this.emit(':tell',message);  
      },
   
    'AMAZON.CancelIntent': function() {
        this.handler.state = '';
         allRestaurants=[];
        currentRestaurantInd=null;
        this.emit('NewSession');
    },
    'AMAZON.StopIntent': function () {
        this.handler.state = '';
         allRestaurants=[];
        currentRestaurantInd=null;
        this.emit(':tell', 'Goodbye' );

    },

    'AMAZON.HelpIntent': function () {  
       this.emit(':ask', 'please say the category to search' );

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
       let category = this.event.request.intent.slots.category.value;

       SpendingUtils.getFavouritePlace(category, (favouritePlace) => {
        let message ;
        if(favouritePlace!=null){
        var required_params = { term: favouritePlace, location: 'Mclean,VA' };//
        allRestaurants= YelpClient.getRestaurantsByrequiredParams(required_params,null);
        console.log('allRestaurants:',allRestaurants);
        message = getResponseMessage(allRestaurants,currentRestaurantInd); 
        }
        else{
            message=HELP_MESSAGE;
        };
        console.log(message);
        this.emit(':tell',message);    
       
        });
         
    },
   'AMAZON.YesIntent': function() { 
        this.handler.state = '';
        allRestaurants=[];
        this.emit(':tell',`Bingo. Thanks for using MASS. Good Bye.`);  
      },
     'AMAZON.NoIntent': function() {
        this.handler.state = '';
        this.emit(':tell', 'Okay, Please seach again, goodbye!');
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

