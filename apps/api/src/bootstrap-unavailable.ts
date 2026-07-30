const responseBody = JSON.stringify(
  {
    ok: false,
    error: {
      code: "FOUNDATION_ROLLBACK",
      message:
        "Website services are temporarily unavailable. Contact Joel for current assistance.",
    },
  },
  null,
  2,
);

function unavailableResponse() {
  return new Response(responseBody, {
    status: 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
      "retry-after": "300",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  fetch() {
    return unavailableResponse();
  },
};
