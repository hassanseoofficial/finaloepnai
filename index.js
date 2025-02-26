const express = require('express');
const OpenAI = require('openai');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const ASSISTANT_ID = process.env.ASSISTANT_ID;

// Create a new thread
async function createThread() {
  try {
    const thread = await openai.beta.threads.create();
    return thread;
  } catch (error) {
    console.error('Error creating thread:', error.message);
    if (error.message.includes('invalid_api_key')) {
      throw new Error('Invalid API key configuration. Please check your environment settings.');
    }
    throw error;
  }
}

// Add message to thread
async function addMsgToThread(msg, threadId) {
  try {
    // Modify the prompt to request structured JSON output
    const structuredPrompt = `
      Please analyze this email and provide the information in the following format:
      {
        "email": "extracted email or null",
        "phone": "extracted phone number or null",
        "name": "extracted first and last name or null",
        "intent": "extracted intent or null"
      }
      
      Email content: ${msg}
    `;
    
    const message = await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: structuredPrompt
    });
    return message;
  } catch (error) {
    console.error('Error adding message:', error);
    throw error;
  }
}

// Run the thread
async function runThread(threadId) {
  try {
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID
    });
    return run;
  } catch (error) {
    console.error('Error running thread:', error);
    throw error;
  }
}

// Retrieve run status
async function retrieveRun(threadId, runId) {
  try {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    return run;
  } catch (error) {
    console.error('Error retrieving run:', error);
    throw error;
  }
}

// Function to parse and structure the assistant's response
function parseAssistantResponse(response) {
  try {
    // Try to parse if response is already JSON
    if (typeof response === 'string' && response.trim().startsWith('{')) {
      return JSON.parse(response);
    }

    // Default structure if parsing fails
    return {
      email: null,
      phone: null,
      name: null,
      intent: null
    };
  } catch (error) {
    console.error('Error parsing response:', error);
    return {
      email: null,
      phone: null,
      name: null,
      intent: null
    };
  }
}

// POST endpoint to handle email analysis
app.post('/analyze', async (req, res) => {
  try {
    // Validate environment variables first
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }
    if (!process.env.ASSISTANT_ID) {
      throw new Error('Assistant ID not configured');
    }

    const emailBody = req.body.EmailBody;
    if (!emailBody) {
      return res.status(400).json({ error: 'EmailBody parameter is required' });
    }

    // Create new thread
    const thread = await createThread();
    console.log('Thread created:', thread.id);

    // Add message to thread
    await addMsgToThread(emailBody, thread.id);

    // Run the thread
    const run = await runThread(thread.id);
    
    // Wait for processing (15 seconds)
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Check run status
    const runStatus = await retrieveRun(thread.id, run.id);

    if (runStatus.status === 'completed') {
      // Get the latest message
      const messages = await openai.beta.threads.messages.list(thread.id);
      const assistantResponse = messages.data[0].content[0].text.value;
      
      // Parse and structure the response
      const structuredResponse = parseAssistantResponse(assistantResponse);
      
      res.json(structuredResponse);
    } else {
      res.status(500).json({ error: 'Processing not completed', status: runStatus.status });
    }

  } catch (error) {
    console.error('Error processing request:', error);
    
    if (error.message.includes('API key')) {
      return res.status(500).json({ 
        error: 'API configuration error. Please contact system administrator.' 
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});