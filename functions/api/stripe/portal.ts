export const onRequestPost: PagesFunction = async () => {
  return new Response(JSON.stringify({ url: "/profile" }), {
    headers: { "Content-Type": "application/json" }
  });
};
