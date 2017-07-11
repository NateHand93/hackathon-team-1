var Alexa = require('alexa-sdk');
var MongoClient = require('mongodb').MongoClient;

var YelpClient = require('./yelp');

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
        alexa.registerHandlers(newSessionHandlers, startModeHandlers);
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

    'SessionEndedRequest': function() {
        console.log('Session ended!')
        this.emit(':tell', 'Goodbye');
    },

    'Unhandled': function() {
        console.log("UNHANDLED");
        this.emit(':ask', 'Sorry, I didn\'t get that. Try again.', 'Try setting your budget!');
    }

});

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
