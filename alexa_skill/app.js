var Alexa = require('alexa-sdk');
var MongoClient = require('mongodb').MongoClient;

let atlas_connection_uri;
let cachedDb = null;

const states = {
    STARTMODE: '_STARTMODE',
    SETBUDGETMODE: '_SETBUDGETMODE',
    GETBUDGETMODE: '_GETBUDGETMODE'
}

exports.handler = (event, context, callback) => {
    context.callbackWaitsForEmptyEventLoop = false;
    initializeDbConnectionThen(() => {
        var alexa = Alexa.handler(event, context, callback);
        alexa.registerHandlers(newSessionHandlers, startModeHandlers, partialResponseHandlers);
        alexa.execute();
    });
}

const initializeDbConnectionThen = (callback) => {
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
        if (amount != null && category != null) {
            var budget = {
                amount,
                category
            }
            saveBudget(budget, () => {
                this.emit(':ask', `
                    Your budget for ${category} has been set to 
                    ${amount} dollars. What else can I do for you?
                `, 'Try setting your budget');
            });
        } else if (amount != null && category == null) {
            //this probably isn't the correct way to handle partial responses
            this.emit('SetBudgetAmountOnly', amount);
        } else if (amount == null && category != null) {
            this.emit('SetBudgetCategoryOnly', category);
        }
    },

    'SessionEndedRequest': function() {
        console.log('Session ended!')
        this.emit(':tell', 'Goodbye');
    },

    'Unhandled': function() {
        console.log("UNHANDLED");
        this.emit(':ask', 'Sorry, I didn\'t get that. Try again.', 'Try setting your budget!');
    }

});

var partialResponseHandlers = {

    'SetBudgetAmountOnly': function(amount) {

    },

    'SetBudgetCategoryOnly': function(category) {

    }

}

var saveBudget = (budget, callback) => {
    var budgetCollection = cachedDb.collection("budget");
    budgetCollection.findOne({category: budget.category}, (err, doc) => {
        if (doc) {
            budget["_id"] = doc["_id"];
        }
        budgetCollection.save(budget, () => {
            console.log('Budget was saved: ' + budget);
            return callback();
        });
    });
    
}