export default {
  fetch() {
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  },
};
