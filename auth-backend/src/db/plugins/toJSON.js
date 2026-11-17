// server/src/db/plugins/toJSON.js
const HIDDEN = ['password', 'emailVerifyTokenHash', 'emailVerifyExpires',
                'passwordResetTokenHash', 'passwordResetExpires'];

export default function toJSONPlugin(schema) {
  const transform = (_doc, ret) => {
    HIDDEN.forEach((key) => delete ret[key]);
    delete ret.__v;
    delete ret.id;          // keep only _id
    return ret;
  };
  schema.set('toJSON',   { virtuals: true, versionKey: false, transform });
  schema.set('toObject', { virtuals: true, versionKey: false });
}
