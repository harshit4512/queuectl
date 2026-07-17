import mongoose from "mongoose";

const configEntrySchema = new mongoose.Schema(
  {
    _id: {
      type: String, // represents the configuration key (e.g. "max_retries")
      required: true,
    },
    value: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    _id: false,
  }
);

const ConfigEntry = mongoose.model("ConfigEntry", configEntrySchema);
export default ConfigEntry;
