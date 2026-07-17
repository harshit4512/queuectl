export const validate = (schema, source = "body") => {
  return (req, res, next) => {
    const dataToValidate = req[source];
    const parsed = schema.safeParse(dataToValidate);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      const fieldPath = firstError.path.join(".");
      const errorMsg = `${fieldPath ? fieldPath + ": " : ""}${firstError.message}`;
      return res.status(400).json({ error: errorMsg });
    }

    // Replace the request source with the parsed/validated data (to enforce default values)
    req[source] = parsed.data;
    next();
  };
};
