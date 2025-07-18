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
    const prompt = `Summarize the following conversation:
User: ${userMessage}
AI: ${cleanedAiResponse}`;

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
        temperature: 0.1,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`LiteLLM API error: ${response.status} ${errorData}`);
    }

    const data = await response.json();

    // Extract the summary from the response
    const summary = data.choices?.[0]?.message?.content || "Failed to generate summary";

    return {
      summary,
      status: "success",
    };
  } catch (error) {
    console.error("Error in summarize endpoint:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate summary",
      }),
    };
  }
});
