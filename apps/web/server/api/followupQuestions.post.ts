import { defineEventHandler, readBody } from "h3";

export default defineEventHandler(async (event) => {
  try {
    // Get runtime config for LiteLLM
    const config = useRuntimeConfig();

    const litellmUrl = config.litellm.url;
    const litellmApiKey = config.litellm.apiKey;
    const litellmModel = config.litellm.model;

    if (!litellmUrl || !litellmApiKey || !litellmModel) {
      throw new Error("LiteLLM configuration is missing");
    }

    // Get request body containing user message and AI response
    const { userMessage, aiResponse } = await readBody(event);

    if (!userMessage || !aiResponse) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Both userMessage and aiResponse are required" }),
      };
    }

    // Clean the AI response by removing HTML markdown if needed
    const cleanedAiResponse = aiResponse.replace(/<[^>]*>?/gm, "");

    // Prepare the prompt for the LLM
    const prompt = `Based on the following conversation, generate exactly 4 relevant follow-up questions the user might want to ask next:
User: ${userMessage}
AI: ${cleanedAiResponse}

Format your response as a numbered list with exactly 4 questions. Make sure each question is concise, specific, and directly related to the conversation topic. Each question MUST be maximum 80 characters in length.`;

    // Make request to LiteLLM using the /chat/completions endpoint
    const chatEndpoint = `${litellmUrl.endsWith("/") ? litellmUrl : `${litellmUrl}/`}chat/completions`;

    const response = await fetch(chatEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${litellmApiKey}`,
      },
      body: JSON.stringify({
        model: litellmModel,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`LiteLLM API error: ${response.status} ${errorData}`);
    }

    const data = await response.json();

    // Extract the response content
    const questionsText = data.choices?.[0]?.message?.content || "";

    // Parse the text response into an array of questions
    // This regex matches lines starting with a number or dash followed by a question
    const questionsRegex = /(?:\d+\.|\-)\s*(.+?)(?=(?:\n\d+\.|\n\-|\n\n|$))/gs;
    const matches = [ ...questionsText.matchAll(questionsRegex) ];

    // Extract the questions from the regex matches
    let questions = matches.map(match => match[1].trim());

    // If regex parsing fails or returns fewer than 4 questions, try simple line splitting
    if (questions.length < 4) {
      questions = questionsText.split("\n")
        .filter((line: string) => line.trim())
        .map((line: string) => line.replace(/^\d+\.|\-\s*/, "").trim())
        .slice(0, 4);
    }

    // Ensure we have exactly 4 questions
    while (questions.length < 4) {
      questions.push("Would you like to know more about this topic?");
    }

    // Limit to 4 questions if we somehow got more
    questions = questions.slice(0, 4);

    return {
      questions,
      status: "success",
    };
  } catch (error) {
    console.error("Error in followupQuestions endpoint:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate follow-up questions",
      }),
    };
  }
});
