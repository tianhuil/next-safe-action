import type { Infer, Schema } from "@typeschema/main";
import { validate } from "@typeschema/main";
import { isNotFoundError } from "next/dist/client/components/not-found.js";
import { isRedirectError } from "next/dist/client/components/redirect.js";
import type {} from "zod";
import type {
	MiddlewareFn,
	MiddlewareResult,
	SafeActionClientOpts,
	SafeActionFn,
	SafeActionResult,
	ServerCodeFn,
} from "./index.types";
import type { InferArray } from "./utils";
import { DEFAULT_SERVER_ERROR_MESSAGE, isError } from "./utils";
import {
	ServerValidationError,
	buildValidationErrors,
	flattenBindArgsValidationErrors,
	flattenValidationErrors,
	returnValidationErrors,
} from "./validation-errors";
import type {
	BindArgsValidationErrors,
	FlattenedBindArgsValidationErrors,
	FlattenedValidationErrors,
	FormatBindArgsValidationErrorsFn,
	FormatValidationErrorsFn,
	ValidationErrors,
} from "./validation-errors.types";

class SafeActionClient<const ServerError, const Ctx = null, const Metadata = null> {
	readonly #handleServerErrorLog: NonNullable<
		SafeActionClientOpts<ServerError, any>["handleServerErrorLog"]
	>;
	readonly #handleReturnedServerError: NonNullable<
		SafeActionClientOpts<ServerError, any>["handleReturnedServerError"]
	>;

	#middlewareFns: MiddlewareFn<ServerError, any, any, Metadata>[];

	constructor(
		opts: {
			middlewareFns: MiddlewareFn<ServerError, any, any, Metadata>[];
		} & Required<
			Pick<
				SafeActionClientOpts<ServerError, any>,
				"handleReturnedServerError" | "handleServerErrorLog"
			>
		>
	) {
		this.#middlewareFns = opts.middlewareFns;
		this.#handleServerErrorLog = opts.handleServerErrorLog;
		this.#handleReturnedServerError = opts.handleReturnedServerError;
	}

	/**
	 * Use a middleware function.
	 * @param middlewareFn Middleware function
	 * @returns SafeActionClient
	 */
	public use<const NextCtx>(middlewareFn: MiddlewareFn<ServerError, Ctx, NextCtx, Metadata>) {
		return new SafeActionClient<ServerError, NextCtx, Metadata>({
			middlewareFns: [...this.#middlewareFns, middlewareFn],
			handleReturnedServerError: this.#handleReturnedServerError,
			handleServerErrorLog: this.#handleServerErrorLog,
		});
	}

	/**
	 * Set metadata for the action that will be defined afterwards.
	 * @param data Metadata for the action
	 * @returns {Function} Define a new action
	 */
	public metadata(data: Metadata) {
		return {
			schema: <const S extends Schema | undefined = undefined, const FVE = ValidationErrors<S>>(
				schema?: S,
				utils?: {
					formatValidationErrors?: FormatValidationErrorsFn<S, FVE>;
				}
			) =>
				this.#schema<S, FVE, Metadata>({
					schema,
					formatValidationErrors: utils?.formatValidationErrors,
					metadata: data,
				}),
			action: <const Data = null>(serverCodeFn: ServerCodeFn<undefined, [], Data, Ctx, Metadata>) =>
				this.#action({
					serverCodeFn,
					bindArgsSchemas: [],
					metadata: data,
				}),
		};
	}

	/**
	 * Pass an input schema to define safe action arguments.
	 * @param schema An input schema supported by [TypeSchema](https://typeschema.com/#coverage).
	 * @returns {Function} The `define` function, which is used to define a new safe action.
	 */
	public schema<const S extends Schema | undefined = undefined, const FVE = ValidationErrors<S>>(
		schema?: S,
		utils?: {
			formatValidationErrors?: FormatValidationErrorsFn<S, FVE>;
		}
	) {
		return this.#schema<S, FVE, null>({
			schema,
			formatValidationErrors: utils?.formatValidationErrors,
			metadata: null,
		});
	}

	/**
	 * Define a new safe action without input arguments.
	 * @param serverCodeFn Server code function
	 * @returns
	 */
	public action<const Data = null>(serverCodeFn: ServerCodeFn<undefined, [], Data, Ctx, null>) {
		return this.#action({
			serverCodeFn,
			bindArgsSchemas: [],
			metadata: null,
		});
	}

	#schema<
		const S extends Schema | undefined = undefined,
		const FVE = ValidationErrors<S>,
		const MD = null,
	>(args: { schema?: S; formatValidationErrors?: FormatValidationErrorsFn<S, FVE>; metadata: MD }) {
		return {
			bindArgsSchemas: <
				const BAS extends readonly Schema[],
				const FBAVE = BindArgsValidationErrors<BAS>,
			>(
				bindArgsSchemas: BAS,
				bindArgsUtils?: {
					formatBindArgsValidationErrors?: FormatBindArgsValidationErrorsFn<BAS, FBAVE>;
				}
			) =>
				this.#bindArgsSchemas<S, BAS, FVE, FBAVE, MD>({
					mainSchema: args.schema,
					bindArgsSchemas,
					formatValidationErrors: args.formatValidationErrors,
					formatBindArgsValidationErrors: bindArgsUtils?.formatBindArgsValidationErrors,
					metadata: args.metadata,
				}),
			action: <const Data = null>(serverCodeFn: ServerCodeFn<S, [], Data, Ctx, MD>) =>
				this.#action({
					schema: args.schema,
					bindArgsSchemas: [],
					serverCodeFn,
					formatValidationErrors: args.formatValidationErrors,
					metadata: args.metadata,
				}),
		};
	}

	#bindArgsSchemas<
		const S extends Schema | undefined,
		const BAS extends readonly Schema[],
		const FVE,
		const FBAVE,
		const MD = null,
	>(args: {
		mainSchema?: S;
		bindArgsSchemas: BAS;
		formatValidationErrors?: FormatValidationErrorsFn<S, FVE>;
		formatBindArgsValidationErrors?: FormatBindArgsValidationErrorsFn<BAS, FBAVE>;
		metadata: MD;
	}) {
		return {
			action: <const Data = null>(serverCodeFn: ServerCodeFn<S, BAS, Data, Ctx, MD>) =>
				this.#action({
					schema: args.mainSchema,
					bindArgsSchemas: args.bindArgsSchemas,
					serverCodeFn,
					formatValidationErrors: args.formatValidationErrors,
					formatBindArgsValidationErrors: args.formatBindArgsValidationErrors,
					metadata: args.metadata,
				}),
		};
	}

	/**
	 * Define a new safe action.
	 * @param serverCodeFn A function that executes the server code.
	 * @returns {SafeActionFn}
	 */
	#action<
		const S extends Schema | undefined,
		const BAS extends readonly Schema[],
		const FVE,
		const FBAVE = undefined,
		const Data = null,
		const MD = null,
	>(args: {
		schema?: S;
		bindArgsSchemas: BAS;
		serverCodeFn: ServerCodeFn<S, BAS, Data, Ctx, MD>;
		formatValidationErrors?: FormatValidationErrorsFn<S, FVE>;
		formatBindArgsValidationErrors?: FormatBindArgsValidationErrorsFn<BAS, FBAVE>;
		metadata: MD;
	}): SafeActionFn<ServerError, S, BAS, FVE, FBAVE, Data> {
		return async (...clientInputs) => {
			let prevCtx: any = null;
			let frameworkError: Error | undefined = undefined;
			const middlewareResult: MiddlewareResult<ServerError, any> = { success: false };

			// If the number of bind args schemas + 1 (which is the optional main arg schema) is greater
			// than the number of provided client inputs, it means that the main argument is missing.
			// This happens when the main schema is missing (since it's optional), or if a void main schema
			// is provided along with bind args schemas.
			if (args.bindArgsSchemas.length + 1 > clientInputs.length) {
				clientInputs.push(undefined);
			}

			// Execute the middleware stack.
			const executeMiddlewareChain = async (idx = 0) => {
				const currentFn = this.#middlewareFns[idx];

				middlewareResult.ctx = prevCtx;

				try {
					if (currentFn) {
						await currentFn({
							clientInput: clientInputs.at(-1), // pass raw client input
							bindArgsClientInputs: args.bindArgsSchemas.length ? clientInputs.slice(0, -1) : [],
							ctx: prevCtx as unknown,
							metadata: args.metadata as Metadata | null,
							next: async ({ ctx }) => {
								prevCtx = ctx;
								await executeMiddlewareChain(idx + 1);
								return middlewareResult;
							},
						});
					} else {
						// Validate the client inputs in parallel.
						const parsedInputs = await Promise.all(
							clientInputs.map((input, i) => {
								// Last client input in the array, main argument (no bind arg).
								if (i === clientInputs.length - 1) {
									// If schema is undefined, set parsed data to undefined.
									if (typeof args.schema === "undefined") {
										return {
											success: true,
											data: undefined,
										} as const;
									}

									// Otherwise, parse input with the schema.
									return validate(args.schema, input);
								}

								// Otherwise, we're processing bind args client inputs.
								return validate(args.bindArgsSchemas[i]!, input);
							})
						);

						let hasBindValidationErrors = false;

						// Initialize the bind args validation errors array with null values.
						// It has the same length as the number of bind arguments (parsedInputs - 1).
						const bindArgsValidationErrors = Array(parsedInputs.length - 1).fill({});
						const parsedInputDatas = [];

						for (let i = 0; i < parsedInputs.length; i++) {
							const parsedInput = parsedInputs[i]!;

							if (parsedInput.success) {
								parsedInputDatas.push(parsedInput.data);
							} else {
								// If we're processing a bind argument and there are validation errors for this one,
								// we need to store them in the bind args validation errors array at this index.
								if (i < parsedInputs.length - 1) {
									bindArgsValidationErrors[i] = buildValidationErrors<BAS[number]>(
										parsedInput.issues
									);

									hasBindValidationErrors = true;
								} else {
									// Otherwise, we're processing the non-bind argument (the last one) in the array.
									const validationErrors = buildValidationErrors<S>(parsedInput.issues);

									middlewareResult.validationErrors = await Promise.resolve(
										args.formatValidationErrors?.(validationErrors) ?? validationErrors
									);
								}
							}
						}

						// If there are bind args validation errors, format them and store them in the middleware result.
						if (hasBindValidationErrors) {
							middlewareResult.bindArgsValidationErrors = await Promise.resolve(
								args.formatBindArgsValidationErrors?.(
									bindArgsValidationErrors as BindArgsValidationErrors<BAS>
								) ?? bindArgsValidationErrors
							);
						}

						if (middlewareResult.validationErrors || middlewareResult.bindArgsValidationErrors) {
							return;
						}

						const data =
							(await args.serverCodeFn({
								parsedInput: parsedInputDatas.at(-1) as S extends Schema ? Infer<S> : undefined,
								bindArgsParsedInputs: parsedInputDatas.slice(0, -1) as InferArray<BAS>,
								ctx: prevCtx as Ctx,
								metadata: args.metadata,
							})) ?? null;

						middlewareResult.success = true;
						middlewareResult.data = data;
						middlewareResult.parsedInput = parsedInputDatas.at(-1);
						middlewareResult.bindArgsParsedInputs = parsedInputDatas.slice(0, -1);
					}
				} catch (e: unknown) {
					// next/navigation functions work by throwing an error that will be
					// processed internally by Next.js.
					if (isRedirectError(e) || isNotFoundError(e)) {
						middlewareResult.success = true;
						frameworkError = e;
						return;
					}

					// If error is ServerValidationError, return validationErrors as if schema validation would fail.
					if (e instanceof ServerValidationError) {
						const ve = e.validationErrors as ValidationErrors<S>;

						middlewareResult.validationErrors = await Promise.resolve(
							args.formatValidationErrors?.(ve) ?? ve
						);

						return;
					}

					// If error is not an instance of Error, wrap it in an Error object with
					// the default message.
					const error = isError(e) ? e : new Error(DEFAULT_SERVER_ERROR_MESSAGE);

					await Promise.resolve(this.#handleServerErrorLog(error));

					middlewareResult.serverError = await Promise.resolve(
						this.#handleReturnedServerError(error)
					);
				}
			};

			await executeMiddlewareChain();

			// If an internal framework error occurred, throw it, so it will be processed by Next.js.
			if (frameworkError) {
				throw frameworkError;
			}

			const actionResult: SafeActionResult<ServerError, S, BAS, FVE, FBAVE, Data> = {};

			if (typeof middlewareResult.data !== "undefined") {
				actionResult.data = middlewareResult.data as Data;
			}

			if (typeof middlewareResult.validationErrors !== "undefined") {
				actionResult.validationErrors = middlewareResult.validationErrors as FVE;
			}

			if (typeof middlewareResult.bindArgsValidationErrors !== "undefined") {
				actionResult.bindArgsValidationErrors = middlewareResult.bindArgsValidationErrors as FBAVE;
			}

			if (typeof middlewareResult.serverError !== "undefined") {
				actionResult.serverError = middlewareResult.serverError;
			}

			return actionResult;
		};
	}
}

/**
 * Initialize a new action client.
 * @param createOpts Options for creating a new action client.
 * @returns {Function} A function that creates a new action, to be used in server files.
 *
 * {@link https://next-safe-action.dev/docs/getting-started See an example}
 */
export const createSafeActionClient = <
	const ServerError = string,
	const MetadataSchema extends Schema | undefined = undefined,
>(
	createOpts?: SafeActionClientOpts<ServerError, MetadataSchema>
) => {
	// If server log function is not provided, default to `console.error` for logging
	// server error messages.
	const handleServerErrorLog =
		createOpts?.handleServerErrorLog ||
		((e) => {
			console.error("Action error:", e.message);
		});

	// If `handleReturnedServerError` is provided, use it to handle server error
	// messages returned on the client.
	// Otherwise mask the error and use a generic message.
	const handleReturnedServerError = ((e: Error) =>
		createOpts?.handleReturnedServerError?.(e) || DEFAULT_SERVER_ERROR_MESSAGE) as NonNullable<
		SafeActionClientOpts<ServerError, MetadataSchema>["handleReturnedServerError"]
	>;

	return new SafeActionClient<
		ServerError,
		null,
		MetadataSchema extends Schema ? Infer<MetadataSchema> : null
	>({
		middlewareFns: [async ({ next }) => next({ ctx: null })],
		handleServerErrorLog,
		handleReturnedServerError,
	});
};

export {
	DEFAULT_SERVER_ERROR_MESSAGE,
	flattenBindArgsValidationErrors,
	flattenValidationErrors,
	returnValidationErrors,
};

export type {
	BindArgsValidationErrors,
	FlattenedBindArgsValidationErrors,
	FlattenedValidationErrors,
	FormatBindArgsValidationErrorsFn,
	FormatValidationErrorsFn,
	MiddlewareFn,
	MiddlewareResult,
	SafeActionClientOpts,
	SafeActionFn,
	SafeActionResult,
	ServerCodeFn,
	ValidationErrors,
};
