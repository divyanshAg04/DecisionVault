import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DecisionVault API',
      version: '1.0.0',
      description:
        'REST API for DecisionVault — a MERN-stack college decision-support platform for Indian students.',
      contact: {
        name: 'DecisionVault Team',
        url: 'https://github.com/divyanshAg04/DecisionVault',
      },
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Local development' },
      { url: 'https://api.decisionvault.dev', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'HttpOnly JWT access cookie set on login/register',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '64abc123' },
            name: { type: 'string', example: 'Divyansh Agrawal' },
            email: { type: 'string', format: 'email', example: 'me@example.com' },
            examTrack: { type: 'string', example: 'JEE' },
            emailVerified: { type: 'boolean', example: false },
          },
        },
        ShortlistItem: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            college: { type: 'object' },
            confidence: { type: 'number', example: 75 },
            status: {
              type: 'string',
              enum: ['researching', 'shortlisted', 'rejected', 'selected'],
            },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } },
          },
        },
        PlacementPrediction: {
          type: 'object',
          properties: {
            placedProbability: { type: 'number', example: 0.82 },
            expectedPackageLpa: { type: 'number', example: 7.5 },
            expectedPackageMin: { type: 'number', example: 6.0 },
            expectedPackageMax: { type: 'number', example: 9.0 },
            modelSource: { type: 'string', example: 'python-sklearn' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Unauthorized' },
          },
        },
      },
    },
    security: [{ cookieAuth: [] }],
    paths: {
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email', 'password'],
                  properties: {
                    name: { type: 'string', minLength: 2 },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    examTrack: { type: 'string', enum: ['JEE', 'CUET', 'Other'] },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'User created successfully',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
            },
            409: { description: 'Email already registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Log in and receive auth cookies',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login successful, sets token + refreshToken cookies' },
            401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Log out and revoke refresh token',
          responses: {
            200: { description: 'Logged out' },
          },
        },
      },
      '/api/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Rotate refresh token (RTR)',
          security: [{ cookieAuth: [] }],
          responses: {
            200: { description: 'New access + refresh token cookies issued' },
            401: { description: 'Refresh token invalid or expired' },
          },
        },
      },
      '/api/auth/verify-email': {
        get: {
          tags: ['Auth'],
          summary: 'Verify email via token',
          security: [],
          parameters: [
            { name: 'token', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Email verified successfully' },
            400: { description: 'Invalid or expired token' },
          },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current user profile',
          responses: {
            200: { description: 'Current user', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/shortlists': {
        get: {
          tags: ['Shortlists'],
          summary: 'Get all shortlisted colleges for current user',
          responses: {
            200: {
              description: 'Array of shortlist items',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/ShortlistItem' } },
                },
              },
            },
          },
        },
        post: {
          tags: ['Shortlists'],
          summary: 'Add or update a college in shortlist',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['college'],
                  properties: {
                    college: { type: 'string', description: 'College _id' },
                    confidence: { type: 'number', minimum: 0, maximum: 100 },
                    pros: { type: 'array', items: { type: 'string' } },
                    cons: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Shortlist item upserted' },
          },
        },
      },
      '/api/ai/ask': {
        post: {
          tags: ['AI'],
          summary: 'Ask the AI counselor a question',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['question'],
                  properties: { question: { type: 'string', minLength: 5 } },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'AI answer',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                      source: { type: 'string', enum: ['gemini', 'fallback'] },
                    },
                  },
                },
              },
            },
            429: { description: 'Rate limit exceeded (5 req/15 min per user)' },
          },
        },
      },
      '/api/ml/predict-placement': {
        post: {
          tags: ['ML'],
          summary: 'Predict placement probability and expected package LPA',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    gender: { type: 'string', example: 'Male' },
                    cgpa: { type: 'number', example: 8.5 },
                    internships: { type: 'integer', example: 2 },
                    codingSkills: { type: 'integer', example: 7 },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Placement prediction with confidence range',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/PlacementPrediction' } } },
            },
          },
        },
      },
      '/api/activities': {
        get: {
          tags: ['Activity'],
          summary: 'Get activity log for current user (Decision Journey)',
          responses: {
            200: {
              description: 'Array of activity log entries',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        action: { type: 'string' },
                        details: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
