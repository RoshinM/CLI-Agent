// Import the readline module to read user input
import readline from 'readline';

// Create an interface to read user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to ask a question and get user input
const askQuestion = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
};

// Main function to perform calculations
(async () => {
    try {
        // Ask user to choose an operation
        const operation = await askQuestion('Choose operation (add, subtract, multiply, divide, square, cube, sqrt, cbrt): ');

        let num1: number, num2: number, result: number;

        // Perform operation based on user's choice
        if (['add', 'subtract', 'multiply', 'divide'].includes(operation)) {
            num1 = parseFloat(await askQuestion('Enter first number: '));
            num2 = parseFloat(await askQuestion('Enter second number: '));

            switch (operation) {
                case 'add':
                    result = num1 + num2;
                    break;
                case 'subtract':
                    result = num1 - num2;
                    break;
                case 'multiply':
                    result = num1 * num2;
                    break;
                case 'divide':
                    if (num2 === 0) {
                        throw new Error('Cannot divide by zero');
                    }
                    result = num1 / num2;
                    break;
                default:
                    throw new Error('Invalid operation');
            }
        } else if (['square', 'cube', 'sqrt', 'cbrt'].includes(operation)) {
            num1 = parseFloat(await askQuestion('Enter a number: '));

            switch (operation) {
                case 'square':
                    result = Math.pow(num1, 2);
                    break;
                case 'cube':
                    result = Math.pow(num1, 3);
                    break;
                case 'sqrt':
                    result = Math.sqrt(num1);
                    break;
                case 'cbrt':
                    result = Math.cbrt(num1);
                    break;
                default:
                    throw new Error('Invalid operation');
            }
        } else {
            throw new Error('Unsupported operation');
        }

        // Display the result
        console.log(`Result: ${result}`);
    } catch (error: any) {
        // Handle any errors that occur
        console.error('An error occurred:', error.message);
    } finally {
        // Close the readline interface
        rl.close();
    }
})();