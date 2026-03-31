export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Ingredient DB API",
    version: "0.1.0",
    description: "API for managing ingredients and grocery store sections."
  },
  servers: [
    { url: "/", description: "Current server" }
  ],
  paths: {
    "/api/sections": {
      get: {
        tags: ["Sections"],
        summary: "List all sections",
        operationId: "listSections",
        responses: {
          "200": {
            description: "Array of sections",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Section" } } } }
          }
        }
      },
      post: {
        tags: ["Sections"],
        summary: "Create a section",
        operationId: "createSection",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateSectionRequest" },
              example: {
                name: "Produce",
                sort_order: 1,
                subcategories: ["Fruits", "Vegetables"]
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Created section",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Section" } } }
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          }
        }
      }
    },
    "/api/sections/{id}": {
      put: {
        tags: ["Sections"],
        summary: "Update a section",
        operationId: "updateSection",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateSectionRequest" },
              example: { name: "Dairy & Eggs", sort_order: 3 }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated section",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Section" } } }
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          },
          "404": {
            description: "Section not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          }
        }
      },
      delete: {
        tags: ["Sections"],
        summary: "Delete a section",
        operationId: "deleteSection",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Section deleted" },
          "404": {
            description: "Section not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          },
          "409": {
            description: "Section is referenced by existing ingredients",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          }
        }
      }
    },
    "/api/ingredients": {
      get: {
        tags: ["Ingredients"],
        summary: "List all ingredients",
        operationId: "listIngredients",
        parameters: [
          {
            name: "section_id",
            in: "query",
            required: false,
            description: "Filter by section ID",
            schema: { type: "string", format: "uuid" }
          }
        ],
        responses: {
          "200": {
            description: "Array of ingredients",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Ingredient" } } } }
          }
        }
      },
      post: {
        tags: ["Ingredients"],
        summary: "Create an ingredient",
        operationId: "createIngredient",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateIngredientRequest" },
              example: {
                name: "Cheddar Cheese",
                section_id: "uuid-of-dairy-section",
                aliases: ["Sharp Cheddar", "Mild Cheddar"]
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Created ingredient",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Ingredient" } } }
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          },
          "409": {
            description: "Duplicate alias conflict",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          }
        }
      }
    },
    "/api/ingredients/search": {
      get: {
        tags: ["Ingredients"],
        summary: "Search ingredients by name or alias",
        operationId: "searchIngredients",
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "Search query string",
            schema: { type: "string", minLength: 1 }
          }
        ],
        responses: {
          "200": {
            description: "Matching ingredients",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Ingredient" } } } }
          },
          "400": {
            description: "Missing or empty query parameter",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          }
        }
      }
    },
    "/api/ingredients/{id}": {
      get: {
        tags: ["Ingredients"],
        summary: "Get an ingredient by ID",
        operationId: "getIngredient",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": {
            description: "The ingredient",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Ingredient" } } }
          },
          "404": {
            description: "Ingredient not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          }
        }
      },
      put: {
        tags: ["Ingredients"],
        summary: "Update an ingredient",
        operationId: "updateIngredient",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateIngredientRequest" },
              example: { name: "Sharp Cheddar", aliases: ["Cheddar", "Old Cheddar"] }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated ingredient",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Ingredient" } } }
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          },
          "404": {
            description: "Ingredient not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          },
          "409": {
            description: "Duplicate alias conflict",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          }
        }
      },
      delete: {
        tags: ["Ingredients"],
        summary: "Delete an ingredient",
        operationId: "deleteIngredient",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Ingredient deleted" },
          "404": {
            description: "Ingredient not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          }
        }
      }
    },
    "/api/ingredients/batch": {
      post: {
        tags: ["Ingredients"],
        summary: "Batch create/update ingredients",
        operationId: "batchIngredients",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BatchRequest" },
              example: {
                operations: [
                  { action: "create", name: "Milk", section_id: "uuid-of-dairy-section", aliases: ["Whole Milk"] },
                  { action: "update", id: "uuid-of-existing-ingredient", name: "2% Milk" }
                ]
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Batch results",
            content: { "application/json": { schema: { $ref: "#/components/schemas/BatchResponse" } } }
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } }
          }
        }
      }
    },
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        operationId: "healthCheck",
        responses: {
          "200": {
            description: "Service is healthy",
            content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", example: "ok" } } } } }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      Section: {
        type: "object",
        required: ["id", "name", "sort_order", "subcategories"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          sort_order: { type: "integer" },
          subcategories: { type: "array", items: { type: "string" } }
        }
      },
      CreateSectionRequest: {
        type: "object",
        required: ["name", "sort_order", "subcategories"],
        properties: {
          name: { type: "string", minLength: 1 },
          sort_order: { type: "integer" },
          subcategories: { type: "array", items: { type: "string" } }
        }
      },
      UpdateSectionRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          sort_order: { type: "integer" },
          subcategories: { type: "array", items: { type: "string" } }
        },
        description: "Provide at least one of: name, sort_order, subcategories"
      },
      Ingredient: {
        type: "object",
        required: ["id", "name", "section_id", "section", "aliases"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          section_id: { type: "string", format: "uuid" },
          section: { $ref: "#/components/schemas/Section" },
          aliases: { type: "array", items: { type: "string" } }
        }
      },
      CreateIngredientRequest: {
        type: "object",
        required: ["name", "section_id", "aliases"],
        properties: {
          name: { type: "string", minLength: 1 },
          section_id: { type: "string", format: "uuid" },
          aliases: { type: "array", items: { type: "string" } }
        }
      },
      UpdateIngredientRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          section_id: { type: "string", format: "uuid" },
          aliases: { type: "array", items: { type: "string" } }
        },
        description: "Provide at least one of: name, section_id, aliases"
      },
      BatchRequest: {
        type: "object",
        required: ["operations"],
        properties: {
          operations: {
            type: "array",
            minItems: 1,
            items: {
              oneOf: [
                { $ref: "#/components/schemas/BatchCreateOperation" },
                { $ref: "#/components/schemas/BatchUpdateOperation" }
              ],
              discriminator: { propertyName: "action" }
            }
          }
        }
      },
      BatchCreateOperation: {
        type: "object",
        required: ["action", "name", "section_id"],
        properties: {
          action: { type: "string", enum: ["create"] },
          name: { type: "string", minLength: 1 },
          section_id: { type: "string", format: "uuid" },
          aliases: { type: "array", items: { type: "string" } }
        }
      },
      BatchUpdateOperation: {
        type: "object",
        required: ["action", "id"],
        properties: {
          action: { type: "string", enum: ["update"] },
          id: { type: "string", format: "uuid" },
          name: { type: "string", minLength: 1 },
          section_id: { type: "string", format: "uuid" },
          aliases: { type: "array", items: { type: "string" } }
        },
        description: "Provide at least one of: name, section_id, aliases"
      },
      BatchResponse: {
        type: "object",
        required: ["summary", "results"],
        properties: {
          summary: {
            type: "object",
            required: ["total", "created", "updated", "failed"],
            properties: {
              total: { type: "integer" },
              created: { type: "integer" },
              updated: { type: "integer" },
              failed: { type: "integer" }
            }
          },
          results: {
            type: "array",
            items: {
              oneOf: [
                { $ref: "#/components/schemas/BatchSuccessResult" },
                { $ref: "#/components/schemas/BatchErrorResult" }
              ]
            }
          }
        }
      },
      BatchSuccessResult: {
        type: "object",
        required: ["index", "action", "status", "ingredient"],
        properties: {
          index: { type: "integer" },
          action: { type: "string", enum: ["create", "update"] },
          status: { type: "string", enum: ["created", "updated"] },
          ingredient: { $ref: "#/components/schemas/Ingredient" }
        }
      },
      BatchErrorResult: {
        type: "object",
        required: ["index", "action", "status", "error"],
        properties: {
          index: { type: "integer" },
          action: { type: "string", enum: ["create", "update"] },
          status: { type: "string", enum: ["error"] },
          error: { $ref: "#/components/schemas/ApiError" }
        }
      },
      ApiError: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["status", "message"],
            properties: {
              status: { type: "integer" },
              message: { type: "string" },
              details: {}
            }
          }
        }
      }
    }
  }
};
