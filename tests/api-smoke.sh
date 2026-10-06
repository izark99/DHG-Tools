#!/usr/bin/env bash
# Phase 0 acceptance against a running `wrangler pages dev` (default http://127.0.0.1:8788).
# Needs the seeded admin (ADMIN_USER / ADMIN_PASSWORD).
set -u
B=${BASE:-http://127.0.0.1:8788}
U=${ADMIN_USER:-admin}
P=${ADMIN_PASSWORD:?set ADMIN_PASSWORD}
pass=0; fail=0
ok() { echo "PASS $1"; pass=$((pass+1)); }
ko() { echo "FAIL $1 :: $2"; fail=$((fail+1)); }
post() { curl -s -D /tmp/h.$$ -o /tmp/b.$$ -w '%{http_code}' -X "${4:-POST}" -H "Origin: $B" -H 'Content-Type: application/json' ${3:+-H "Cookie: $3"} --data "$2" "$B$1"; }
get() { curl -s -o /tmp/b.$$ -w '%{http_code}' ${2:+-H "Cookie: $2"} "$B$1"; }
cookie() { grep -i '^set-cookie:' /tmp/h.$$ | head -1 | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]*).*/\1/' | tr -d '\r'; }

c=$(get /api/me); [ "$c" = 401 ] && ok "no session → /api/me 401" || ko "/api/me without session" "$c"
for r in /api/flows /api/masters /api/users /api/backup /api/nope; do
  c=$(get $r); [ "$c" = 401 ] && ok "no session → $r 401" || ko "$r without session" "$c"
done

c=$(post /api/login "{\"username\":\"$U\",\"password\":\"$P\"}")
[ "$c" = 200 ] && ok "admin login" || ko "admin login" "$c $(cat /tmp/b.$$)"
grep -qi 'set-cookie:.*HttpOnly; Secure; SameSite=Strict' /tmp/h.$$ && ok "cookie flags" || ko "cookie flags" "$(grep -i set-cookie /tmp/h.$$)"
A=$(cookie)
c=$(get /api/me "$A"); grep -q "\"role\":\"admin\"" /tmp/b.$$ && ok "me = admin ($(cat /tmp/b.$$))" || ko "me" "$c $(cat /tmp/b.$$)"
curl -s -D - -o /dev/null -H "Cookie: $A" "$B/api/me" | grep -qi "content-security-policy: default-src 'self'; connect-src 'self'" && ok "CSP header on API" || ko "CSP" "missing"

c=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Cookie: $A" --data '{}' "$B/api/logout")
[ "$c" = 403 ] && ok "POST without Origin → 403" || ko "csrf" "$c"
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -H "Cookie: $A" --data '{}' "$B/api/logout")
[ "$c" = 403 ] && ok "POST with foreign Origin → 403" || ko "csrf2" "$c"

N="u$RANDOM$RANDOM"
c=$(post /api/users "{\"username\":\"$N\",\"display_name\":\"Test\",\"role\":\"user\",\"password\":\"TempPass1234\"}" "$A")
[ "$c" = 201 ] && ok "admin creates user $N" || ko "create user" "$c $(cat /tmp/b.$$)"

c=$(post /api/login "{\"username\":\"$N\",\"password\":\"TempPass1234\"}"); X=$(cookie)
[ "$c" = 200 ] && grep -q '"must_change_password":true' /tmp/b.$$ && ok "user login with temp password, must change" || ko "user login" "$c $(cat /tmp/b.$$)"
c=$(get /api/flows "$X"); [ "$c" = 403 ] && ok "must change password before other APIs" || ko "must-change gate" "$c"
c=$(post /api/password '{"current":"TempPass1234","next":"short"}' "$X"); [ "$c" = 400 ] && ok "min length 10 enforced" || ko "min length" "$c"
c=$(post /api/password '{"current":"TempPass1234","next":"UserPass56789"}' "$X"); X2=$(cookie)
[ "$c" = 200 ] && ok "password changed" || ko "password change" "$c $(cat /tmp/b.$$)"
c=$(get /api/me "$X"); [ "$c" = 401 ] && ok "old session deleted on password change" || ko "old session" "$c"
X=$X2
c=$(get /api/flows "$X"); [ "$c" = 200 ] && ok "user reads flows" || ko "user flows" "$c"
c=$(get /api/users "$X"); [ "$c" = 403 ] && ok "user → admin GET /api/users 403" || ko "user admin get" "$c"
c=$(post /api/users '{"username":"zzz","password":"xxxxxxxxxxxx"}' "$X"); [ "$c" = 403 ] && ok "user → admin POST /api/users 403" || ko "user admin post" "$c"
c=$(post /api/masters/Params '{"columns":["key","value"],"rows":[]}' "$X" PUT); [ "$c" = 403 ] && ok "user → PUT master 403" || ko "user put master" "$c"
c=$(get /api/backup "$X"); [ "$c" = 403 ] && ok "user → backup 403" || ko "user backup" "$c"
c=$(post /api/flows '{"id":"X1","name":"x"}' "$X"); [ "$c" = 403 ] && ok "user → create flow 403" || ko "user create flow" "$c"

# interface texts: admin writes, everyone signed in reads, only login / brand texts before sign-in
c=$(post /api/ui-texts/home.guide '{"value":"Hướng dẫn nội bộ"}' "$A" PUT); [ "$c" = 200 ] && ok "admin sets a page text" || ko "admin put text" "$c $(cat /tmp/b.$$)"
c=$(post /api/ui-texts/login.sub '{"value":"Liên hệ phòng NS"}' "$A" PUT); [ "$c" = 200 ] && ok "admin sets a login text" || ko "admin put login text" "$c"
c=$(post /api/ui-texts/home.title '{"value":"x"}' "$X" PUT); [ "$c" = 403 ] && ok "user → PUT text 403" || ko "user put text" "$c"
c=$(post /api/ui-texts/home.title '' "$X" DELETE); [ "$c" = 403 ] && ok "user → DELETE text 403" || ko "user delete text" "$c"
c=$(get /api/ui-texts "$X"); grep -q 'Hướng dẫn nội bộ' /tmp/b.$$ && ok "user reads texts" || ko "user texts" "$c $(cat /tmp/b.$$)"
c=$(get /api/ui-texts); [ "$c" = 200 ] && grep -q 'login.sub' /tmp/b.$$ && ! grep -q 'home.guide' /tmp/b.$$ && ok "no session → only login texts" || ko "public texts" "$c $(cat /tmp/b.$$)"
c=$(post /api/ui-texts/home.title "{\"value\":\"$(head -c 4100 /dev/zero | tr '\0' a)\"}" "$A" PUT); [ "$c" = 400 ] && ok "text longer than 4000 rejected" || ko "text length" "$c"
c=$(post /api/ui-texts/home.guide '' "$A" DELETE); c2=$(post /api/ui-texts/login.sub '' "$A" DELETE)
[ "$c$c2" = 200200 ] && ok "admin resets texts" || ko "reset texts" "$c $c2"

for i in 1 2 3 4 5; do c=$(post /api/login "{\"username\":\"$N\",\"password\":\"wrong-password-$i\"}"); done
[ "$c" = 401 ] && ok "5 wrong passwords rejected" || ko "wrong pw" "$c"
c=$(post /api/login "{\"username\":\"$N\",\"password\":\"UserPass56789\"}")
[ "$c" = 401 ] && ok "6th attempt (correct password) locked out" || ko "lockout" "$c"
M1=$(cat /tmp/b.$$); post /api/login '{"username":"nobody-here","password":"whatever-123"}' >/dev/null; M2=$(cat /tmp/b.$$)
[ "$M1" = "$M2" ] && ok "same message for unknown user / locked / wrong password" || ko "generic message" "$M1 vs $M2"

c=$(post "/api/users/$N" '{"unlock":true,"active":false}' "$A" PATCH); [ "$c" = 200 ] && ok "admin deactivates user" || ko "deactivate" "$c"
c=$(get /api/me "$X"); [ "$c" = 401 ] && ok "deactivated user's session gone" || ko "deactivate session" "$c"

c=$(post /api/logout '{}' "$A"); c=$(get /api/me "$A"); [ "$c" = 401 ] && ok "logout deletes session" || ko "logout" "$c"
echo "---- $pass passed, $fail failed"
rm -f /tmp/h.$$ /tmp/b.$$
[ $fail = 0 ]
