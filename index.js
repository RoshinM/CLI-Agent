import {TextServiceClient} from "@google-ai/generativelanguage";

const client = new TextServiceClient();

async function init() {
  const response = await client.generateText({
    model: "models/text-bison-001",
    prompt: {
      text: "Hey there"
    }
  });

  console.log(response.candidates[0].output);
}

init();
