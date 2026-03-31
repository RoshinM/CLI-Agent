import * as readline from 'readline';

// Create a readline interface to get user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to reverse a name
const reverseName = (name: string): string => {
  try {
    // Reverse the name
    const reversedName = name.split('').reverse().join('');
    return reversedName;
  } catch (error) {
    console.error('Error reversing name:', error);
    return 'Error reversing name';
  }
};

// Function to ask the user for their name
const askForName = (): void => {
  // Ask the user for their name
  rl.question('Please enter your name (or type \'exit\' to quit): ', (name: string) => {
    if (name.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      rl.close();
    } else {
      // Reverse the name and display it
      const reversedName = reverseName(name);
      console.log(`Your name in reverse is: ${reversedName}`);
      askForName();
    }
  });
};

// Start asking for names
askForName();