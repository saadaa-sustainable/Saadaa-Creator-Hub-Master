export default function Loading() {
  return (
    <div className="post-assets-stage post-assets-loading" aria-label="Loading Post Assets">
      <div className="post-assets-loading__hero" />
      <div className="post-assets-loading__toolbar" />
      <div className="post-assets-loading__body">
        <div className="post-assets-loading__rail" />
        <div className="post-assets-loading__content">
          <div className="post-assets-loading__heading" />
          <div className="post-assets-loading__cards">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="post-assets-loading__card" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
