/**
 * Renders a schema.org JSON-LD block. Server component — emits a plain
 * <script> tag; `<` is escaped to prevent the payload from closing the tag.
 */
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
