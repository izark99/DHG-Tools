// Interface texts for every page. Without a session only the login / brand texts are returned.
import { json, route, type Handler } from '../../_lib/http';
import { isPublicText } from '../../_lib/texts';

export const onRequestGet: Handler = route(async ({ env, data }) => {
  const { results } = await env.DB.prepare('SELECT key, value FROM ui_texts').all<{ key: string; value: string }>();
  const texts: Record<string, string> = {};
  for (const r of results) if (data.user || isPublicText(r.key)) texts[r.key] = r.value;
  return json({ texts });
});
