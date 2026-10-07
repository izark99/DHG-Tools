// Unknown /api routes: 404 (after the middleware has already required a session).
import { error, type Handler } from '../_lib/http';

export const onRequest: Handler = async () => error(404, 'Không có API này');
