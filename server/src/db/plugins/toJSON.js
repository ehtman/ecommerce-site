/**
 * src/db/plugins/toJSON.js – a Mongoose plugin that cleans documents before they are sent.
 *
 * WHAT: When Express calls res.json(user), Mongoose turns the document into JSON.
 *       This plugin deletes secret/internal fields during that step.
 * WHY:  "Secure by default": even if a developer forgets, a password hash or a
 *       reset-token hash can never leak in an API response.
 * USED BY: every model (`schema.plugin(toJSON)`).
 */
// Fields that must NEVER be sent to a client
const HIDDEN = [
  'password',
  'emailVerifyTokenHash',
  'emailVerifyExpires',
  'passwordResetTokenHash',
  'passwordResetExpires',
];

export default function toJSONPlugin(schema) {
  // `transform` runs every time a document becomes JSON; `ret` is the plain object
  const transform = (_doc, ret) => {
    HIDDEN.forEach((key) => delete ret[key]); // remove secrets
    delete ret.__v; // Mongoose's internal version counter – useless to clients
    delete ret.id; // virtual copy of _id – keep only `_id` so there is one way to read it
    return ret;
  };
  // virtuals: true → include computed fields; versionKey: false → no __v
  schema.set('toJSON', { virtuals: true, versionKey: false, transform });
  schema.set('toObject', { virtuals: true, versionKey: false });
}
