import dotenv from 'dotenv';

dotenv.config();

/**
 * Default guardrails for DecisionVault's Gemini integrations.
 * Restricts the assistant to college selection, admissions, placements, and academic counseling.
 */
const DEFAULT_GUARDRAILS = `You are a helpful assistant for DecisionVault. You must restrict all analysis, counseling, and responses strictly to college selection, admissions, exams (such as JEE, BITSAT, State entrance exams), placements, and related academic counseling. Politely decline any off-topic queries.`;

/**
 * Centralized helper to call the Gemini API.
 * Handles timeouts (15 seconds), JSON schemas, system instruction guardrails, and error handling.
 *
 * @param {Array} contents - The contents array matching Gemini's structure.
 * @param {Object} [options] - Options for the request.
 * @param {string} [options.systemInstruction] - Specific system instructions.
 * @param {Object} [options.responseSchema] - Optional JSON schema for structured outputs.
 * @returns {Promise<Object>} The parsed JSON response from Gemini.
 */
export async function callGemini(contents, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  // Set up 15-second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const systemInstructionText = options.systemInstruction || DEFAULT_GUARDRAILS;

    const requestBody = {
      contents,
      systemInstruction: {
        parts: [{ text: systemInstructionText }],
      },
    };

    // Configure response MIME type and schema if provided
    if (options.responseSchema) {
      requestBody.generationConfig = {
        responseMimeType: 'application/json',
        responseSchema: options.responseSchema,
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errData)}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error('Empty response from Gemini API.');
    }

    // Since we requested application/json with schema, we parse the output directly.
    return JSON.parse(rawText.trim());
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Gemini API call timed out after 15 seconds.');
    }
    throw error;
  }
}
