var SpendingUtils = {};
let bigdecimal = require('bigdecimal');
let RestClient = require('node-rest-client').Client;
let restClient = new RestClient();
const spendingUrl = process.env["SPENDING_SERVICE_URL"];

//gets an array of spending data (including metadata) for the current calendar month for a given category
//takes a category and a callback function as arguments
SpendingUtils.getSpendingData = (category, callback) => {
    let queryArgs = getDateRange();
    queryArgs.category = category
    restClient.get(spendingUrl, {parameters: queryArgs}, (data, res) => {
        callback(data);
    });
}

//gets the total amount spent in a given category in the current month
//takes a category and a callback function as arguments
SpendingUtils.getSpendingAmount = (category, callback) => {
    let queryArgs = getDateRange();
    queryArgs.category = category;
    restClient.get(spendingUrl, {parameters: queryArgs}, (data, res) => {
        let spendingAmount = getSum(data);
        callback(spendingAmount);
    });
}

let getSum = (transactionArr) => {
    let sum = new bigdecimal.BigDecimal('0');
    transactionArr.forEach((transaction) => {
        sum = sum.add(new bigdecimal.BigDecimal(transaction.amount));
    });
    return sum
        .setScale(2, bigdecimal.RoundingMode.HALF_UP());
}

let getDateRange = () => {
    let now = new Date();
    let from = new Date(now.getFullYear(), now.getMonth(), 1);
    let to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
        from: from.toLocaleDateString('en-us'), 
        to: to.toLocaleDateString('en-us')
    }
}

module.exports = SpendingUtils;