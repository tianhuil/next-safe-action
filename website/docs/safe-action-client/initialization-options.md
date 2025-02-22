---
sidebar_position: 1
description: You can initialize a safe action client with these options.
---

# Initialization options

## `handleReturnedServerError?`

You can provide this optional function to the safe action client. It is used to customize the server error returned to the client, if one occurs during action's server execution. This includes errors thrown by the action server code, and errors thrown by the middleware.

Here's a simple example, changing the default message for every error thrown on the server:

```typescript title=src/lib/safe-action.ts
export const actionClient = createSafeActionClient({
  // Can also be an async function.
  handleReturnedServerError(e) {
    return "Oh no, something went wrong!";
  },
});
```

<br/>

A more useful one would be to customize the message based on the error type. We can, for instance, create a custom error class and check the error type inside this function:

```typescript title=src/lib/safe-action.ts
import { DEFAULT_SERVER_ERROR_MESSAGE } from "next-safe-action";

class MyCustomError extends Error {}

export const actionClient = createSafeActionClient({
  // Can also be an async function.
  handleReturnedServerError(e) {
    // In this case, we can use the 'MyCustomError` class to unmask errors
    // and return them with their actual messages to the client.
    if (e instanceof MyCustomError) {
      return e.message;
    }

    // Every other error that occurs will be masked with the default message.
    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
});
```

Note that the return type of this function will determine the type of the server error that will be returned to the client. By default it is a string with the `DEFAULT_SERVER_ERROR_MESSAGE` for all errors.

## `handleServerErrorLog?`

You can provide this optional function to the safe action client. This is used to define how errors should be logged when one occurs while the server is executing an action. This includes errors thrown by the action server code, and errors thrown by the middleware. Here you get as argument the **original error object**, not a message customized by `handleReturnedServerError`, if provided.

Here's a simple example, logging error to the console while also reporting it to an error handling system:

```typescript title=src/lib/safe-action.ts
export const actionClient = createSafeActionClient({
  // Can also be an async function.
  handleServerErrorLog(e) {
    // We can, for example, also send the error to a dedicated logging system.
    reportToErrorHandlingSystem(e);

    // And also log it to the console.
    console.error("Action error:", e.message);
  }
});
```

## `defineMetadataSchema?`

You can provide this optional function to the safe action client. This is used to define the type of the metadata for safe actions. If not provided, `metadata` will default to `null` value. You can find more information about metadata in the [`metadata` instance method section](/docs/safe-action-client/instance-methods#metadata).

Here's an example defining a client with a metadata object containing `actionName` as a string, using a Zod schema:

```typescript title="src/app/safe-action.ts"
import { createSafeActionClient } from "next-safe-action";

export const actionClient = createSafeActionClient({
  defineMetadataSchema() {
    return z.object({
      actionName: z.string(),
    });
  },
});
```

Note that the schema is used just to infer the type of the metadata, and not to validate it.
