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

const returnDefaultEvent = (event) => Object.assign(
  {
     "requiredParams": {
        "term": "food",
        "location": "mclean"
        
    },
    "additionalParams" :{
    "rating" :"5",
    "distance":"100",
    "budgetAmount":"30",
    "peopleCount":"1"
  }
    },
  
  event
);


exports.handler = (event, context, callback) => {
    context.callbackWaitsForEmptyEventLoop = false;
    initializeDbConnectionThen(() => {
        var alexa = Alexa.handler(returnDefaultEvent(event), context, callback);
		alexa.resources = languageStrings;
        alexa.registerHandlers(newSessionHandlers, startModeHandlers, searchModeHandlers, surpriseModeHandlers);
        alexa.execute();
    });
}

const initializeDbConnectionThen = (callback) => {
    //var uri = "mongodb://hackathon_team1:Hexaware123!%40#@fintech1-shard-00-00-jaiox.mongodb.net:27017,fintech1-shard-00-01-jaiox.mongodb.net:27017,fintech1-shard-00-02-jaiox.mongodb.net:27017/hackathon?ssl=true&replicaSet=FinTech1-shard-0&authSource=admin"
	
	var uri = process.env['MONGODB_ATLAS_CLUSTER_URI'];
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

    'FindTheRestaurantIntent': function (){
       var additional_params={
        budgetAmount:event.additionalParams.budgetAmount,
        distance:event.additionalParams.distance,//this.event.request.intent.slots.distance,
        rating:event.additionalParams.rating,//this.event.request.intent.slots.rating,
        price:event.additionalParams.price//this.event.request.intent.slots.price
        };
        var required_params = {
            
            term: event.requiredParams.term,//this.event.request.intent.slots.term,
            location:event.requiredParams.location
        };
        console.log('SearchIntent');
       let allRestaurants= YelpClient.getAllRestaurants(required_params,additional_params);
        if(allRestaurants.length==0 || additional_params==null){
            this.state =states.SURPRISEMODE;
            this.emitWithState('surpriseIntent');  
        }
        else{
            this.emit(':tell',"I found the places for you" );
            for (var i = 0; i < allRestaurants.length; i++) {
               var priceRange= YelpClient.getPriceRange(allRestaurants[i].price);
              let  message =`Wonderful. How about ${allRestaurants[i].name}  located at ${allRestaurants[i].location}.
                 Their rating is ${allRestaurants[i].rating} stars. 
                 Price range for one person would be ${priceRange}. 
                 Does this work for you? Or say Repeat.`
               this.emit(':tell',message);
             }
            
            this.emit(':tell','Done with search. Please say stop to quit');
        };
    },
    'AMAZON.CancelIntent': function() {
        this.handler.state = '';
        this.emit('NewSession');
    },
    'AMAZON.StopIntent': function () {
        this.emit(':tell', 'Goodbye' );

    },

    'AMAZON.HelpIntent': function () {  
       this.emit(':ask', 'please say the category to seach the place to go' );

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

        var required_params = {
            term: event.requiredParams.term,//this.event.request.intent.slots.term,
            location:event.requiredParams.location
        };
       var surprisePlace = SpendingUtils.getFavouritePlace();
       required_params.term=surprisePlace;
       var additionalParams;
     
       let allRestaurants= YelpClient.getAllRestaurants(required_params,additionalParams);
       var priceRange= YelpClient.getPriceRange(allRestaurants[0].price);
         let  message =`Wonderful. How about ${allRestaurants[0].name}  located at ${allRestaurants[0].location}.
                 Their rating is ${allRestaurants[0].rating} stars. 
                 Price range for one person would be ${priceRange}. 
                 Does this work for you? Or say Repeat.`
         this.emit(':tell',message);    
         
    },
    'AMAZON.YesIntent': function() {  // Yes, I want to start the practice
        this.state =states.SURPRISEMODE;
        this.emitWithState('surpriseIntent');  
      },
     'AMAZON.NoIntent': function() {
        this.emit(':tell', 'Okay, Please seach with proper term, goodbye!');
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

