console.log ("Starting to Dress the Trump Data");

var content = require('./trump-tweets.json');

for (var tweet in content) {
    console.log("Text = " + content[tweet].text);
}