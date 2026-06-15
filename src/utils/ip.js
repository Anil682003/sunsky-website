export const BASE_URL = "http://localhost:5000/api";
// export const BASE_URL = "http://91.134.71.79:5000/api";
// export const BASE_URL = "https://admin.holidaybooking.be/api";

/** Base URL for static uploads (logos, images). Strips /api from BASE_URL. */
export const UPLOAD_BASE_URL = BASE_URL.replace(/\/api\/?$/, "");
