var http = require ('http');
var request = require('sync-request');

const PORT = 80;
const service_ip = '10.10.10.100';

const SUM_SERVICE_IP_PORT = 'http://'+service_ip+':31001';
const SUB_SERVICE_IP_PORT = 'http://'+service_ip+':31002';
const MUL_SERVICE_IP_PORT = 'http://'+service_ip+':31003';
const DIV_SERVICE_IP_PORT = 'http://'+service_ip+':31004';

String.prototype.isNumeric = function() {
    return !isNaN(parseFloat(this)) && isFinite(this);
}
Array.prototype.clean = function() {
    for(var i = 0; i < this.length; i++) {
        if(this[i] === "") {
            this.splice(i, 1);
            i--; // pour ne pas sauter un élément
        }
    }
    return this;
}		
function infixToPostfix(exp) {
	var outputQueue = [];
	var operatorStack = [];
	var operators = {
        "/": { precedence: 3, associativity: "Left" },
		"*": { precedence: 3, associativity: "Left" },
		"+": { precedence: 2, associativity: "Left" },
		"-": { precedence: 2, associativity: "Left" }
    };
	exp = exp.replace(/\s+/g, "");
	exp = exp.split(/([\+\-\*\/\(\)])/).clean();
	for(var i = 0; i < exp.length; i++) {
		var token = exp[i];
		if(token.isNumeric())
			outputQueue.push(token);
		else if("*/+-".indexOf(token) !== -1) {
			var o1 = token;
			var o2 = operatorStack[operatorStack.length - 1];
			while("*/+-".indexOf(o2) !== -1 &&
                 ((operators[o1].associativity === "Left" && operators[o1].precedence <= operators[o2].precedence) ||
                  (operators[o1].associativity === "Right" && operators[o1].precedence < operators[o2].precedence))){
				outputQueue.push(operatorStack.pop());
				o2 = operatorStack[operatorStack.length - 1];
			}
			operatorStack.push(o1);
		}
		else if(token === "(")
			operatorStack.push(token);
		else if(token === ")") {
			while(operatorStack[operatorStack.length - 1] !== "(")
				outputQueue.push(operatorStack.pop());
			operatorStack.pop();
		}
	}
	while(operatorStack.length > 0)
		outputQueue.push(operatorStack.pop());
	return outputQueue;
}

// Nouvelle version : mesure la durée de l'appel au micro-service
function doOperation(a, b, operator) {
	var reqBody = a + " " + b;
	var service_host;
	switch (operator) {
		case "+": service_host = SUM_SERVICE_IP_PORT; break;
		case "-": service_host = SUB_SERVICE_IP_PORT; break;
		case "*": service_host = MUL_SERVICE_IP_PORT; break;
		case "/": service_host = DIV_SERVICE_IP_PORT; break;
	}

    // début mesure
    const start = process.hrtime.bigint();
	var resp = request('POST', service_host, {body: reqBody});
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6; // en millisecondes

	var res = parseFloat(resp.getBody());

    // on retourne aussi la durée et le contexte d'opération
	return {
        result: res,
        durationMs: durationMs,
        operator: operator,
        a: a,
        b: b
    };
}

// Retourne le résultat ET la liste des timings
function evaluatePostfix(tokens) {
	var stack = [];
    var timings = [];
	tokens.forEach(function(tk) {
		switch (tk) {
			case "*":
			case "/":
			case "+":
			case "-":
				var y = parseFloat(stack.pop());
				var x = parseFloat(stack.pop());
				var opRes = doOperation(x, y, tk);
				stack.push(opRes.result);
                timings.push(opRes);
			break;

			default:
				stack.push(tk);
			break;
		}
	});
	return {
        result: stack.pop(),
        timings: timings
    };
}

console.log("Listening on port : " + PORT);
http.createServer (function(req, resp) {
	let body = [];
	req.on('data', (chunk) => { 
			body.push(chunk);
		})
	   .on('end', () => { 
			body = Buffer.concat(body).toString(); 
			
			resp.writeHead(200, {'Content-Type': 'text/plain'});
			if (body.length != 0) {
				let tks = infixToPostfix(body);
				let evalRes = evaluatePostfix(tks);
                let res = evalRes.result;
                let timings = evalRes.timings;

				console.log("New request : ");
				console.log(body + " = " + res);

                // Log des durées dans la console
                timings.forEach((op, idx) => {
                    console.log(
                        `Op ${idx+1}: ${op.a} ${op.operator} ${op.b} = ${op.result} ` +
                        `(${op.durationMs.toFixed(3)} ms)`
                    );
                });
				console.log("\r\n");

				resp.write("result = " + res + "\r\n");
                resp.write("operations timings:\r\n");
                timings.forEach((op, idx) => {
                    resp.write(
                        `op${idx+1}: ${op.a} ${op.operator} ${op.b} = ${op.result} ` +
                        `(${op.durationMs.toFixed(3)} ms)\r\n`
                    );
                });
			}
			resp.end();
	   });

}).listen(PORT);




