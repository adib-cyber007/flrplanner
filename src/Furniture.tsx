import type { FurnitureType } from "../shared/model";
export function Furniture({
  type,
  color = "#bbc2ac",
}: {
  type: FurnitureType;
  color?: string;
}) {
  const line = "#746e63";
  const common = {
    stroke: line,
    strokeWidth: 1.2,
    strokeLinejoin: "round" as const,
  };
  return (
    <g {...common}>
      {type === "sofa" && (
        <>
          <rect x="3" y="7" width="94" height="85" rx="10" fill={color} />
          <rect x="13" y="24" width="74" height="59" rx="5" fill={color} />
          <path d="M38 25V82M63 25V82M13 26H87" opacity=".5" />
          <rect x="2" y="23" width="12" height="65" rx="4" fill={color} />
          <rect x="86" y="23" width="12" height="65" rx="4" fill={color} />
          <rect
            x="18"
            y="34"
            width="15"
            height="23"
            rx="4"
            fill="#dedcce"
            transform="rotate(-12 25 45)"
          />
          <rect
            x="68"
            y="35"
            width="14"
            height="24"
            rx="3"
            fill="#e6e1d4"
            transform="rotate(9 75 47)"
          />
        </>
      )}
      {type === "armchair" && (
        <>
          <rect x="10" y="10" width="80" height="80" rx="18" fill={color} />
          <rect x="22" y="27" width="56" height="55" rx="12" fill={color} />
          <path d="M22 28V80M78 28V80" />
          <rect x="27" y="20" width="46" height="17" rx="7" fill="#d2b599" />
        </>
      )}
      {(type === "bed" || type === "single-bed") && (
        <>
          <rect x="4" y="3" width="92" height="94" rx="4" fill="#c3b9a7" />
          <rect x="9" y="9" width="82" height="83" rx="3" fill="#f5f0e5" />
          <rect
            x="13"
            y="13"
            width={type === "bed" ? 33 : 74}
            height="21"
            rx="5"
            fill="#f9f7ee"
          />
          {type === "bed" && (
            <rect x="54" y="13" width="33" height="21" rx="5" fill="#f9f7ee" />
          )}
          <path d="M9 38H91V92H9Z" fill={color} />
          <path d="M9 44H91M9 79H91" stroke="#87917f" opacity=".6" />
          <path d="M12 80H88V92H12Z" fill="#e3dbcb" stroke="none" />
          <path d="M9 38Q27 44 50 39T91 38" fill="none" />
        </>
      )}
      {(type === "coffee" ||
        type === "island" ||
        type === "desk" ||
        type === "nightstand") && (
        <>
          <rect
            x="4"
            y="6"
            width="92"
            height="88"
            rx={type === "coffee" ? 25 : 4}
            fill={color}
          />
          <rect
            x="9"
            y="11"
            width="82"
            height="78"
            rx={type === "coffee" ? 22 : 2}
            fill="none"
            opacity=".25"
          />
          {type === "coffee" ? (
            <>
              <circle cx="64" cy="43" r="14" fill="#e8e1d5" />
              <circle cx="64" cy="43" r="9" fill="#bdb6a0" />
              <rect
                x="22"
                y="45"
                width="22"
                height="27"
                fill="#e8e2d8"
                transform="rotate(-12 33 58)"
              />
            </>
          ) : type === "desk" ? (
            <>
              <rect
                x="29"
                y="20"
                width="42"
                height="39"
                rx="2"
                fill="#697770"
              />
              <path d="M35 65H65" strokeWidth="4" />
            </>
          ) : type === "nightstand" ? (
            <circle cx="50" cy="50" r="23" fill="#ede5d5" />
          ) : (
            <>
              <circle cx="74" cy="38" r="11" fill="#e7e2d6" />
              <circle cx="74" cy="38" r="5" fill="#8d9d76" />
            </>
          )}
        </>
      )}
      {type === "dining" && (
        <>
          <g fill="#c2b195">
            <rect x="19" y="3" width="23" height="27" rx="7" />
            <rect x="58" y="3" width="23" height="27" rx="7" />
            <rect x="19" y="70" width="23" height="27" rx="7" />
            <rect x="58" y="70" width="23" height="27" rx="7" />
            <rect x="0" y="36" width="25" height="28" rx="7" />
            <rect x="75" y="36" width="25" height="28" rx="7" />
          </g>
          <rect x="9" y="21" width="82" height="58" rx="24" fill={color} />
          <path d="M24 30H76M24 70H76" opacity=".2" />
          <circle cx="52" cy="49" r="10" fill="#d8dfc7" />
          <path d="M46 48L57 44M51 41L50 57" stroke="#7b9466" />
        </>
      )}
      {type === "chair" && (
        <>
          <rect x="14" y="14" width="72" height="70" rx="13" fill={color} />
          <rect x="13" y="9" width="74" height="18" rx="5" fill={color} />
        </>
      )}
      {(type === "wardrobe" ||
        type === "bookshelf" ||
        type === "kitchen" ||
        type === "tv") && (
        <>
          <rect x="2" y="5" width="96" height="90" rx="2" fill={color} />
          <path d="M25 5V95M50 5V95M75 5V95M2 80H98" opacity=".4" />
          {type === "kitchen" && (
            <>
              <rect
                x="53"
                y="12"
                width="40"
                height="64"
                rx="3"
                fill="#dcded3"
              />
              <g fill="none">
                <circle cx="64" cy="31" r="8" />
                <circle cx="82" cy="32" r="6" />
                <circle cx="65" cy="58" r="6" />
                <circle cx="83" cy="58" r="8" />
              </g>
            </>
          )}
          {type === "tv" && (
            <rect x="12" y="13" width="76" height="20" fill="#414844" />
          )}
        </>
      )}
      {type === "plant" && (
        <>
          <circle cx="50" cy="50" r="26" fill="#c3b99c" />
          <g fill={color} stroke="#58704d">
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <ellipse
                key={a}
                cx="50"
                cy="30"
                rx="13"
                ry="24"
                transform={`rotate(${a} 50 50)`}
              />
            ))}
          </g>
          <circle cx="50" cy="50" r="10" fill="#8ca275" />
        </>
      )}
      {type === "rug" && (
        <>
          <rect x="2" y="2" width="96" height="96" fill={color} stroke="none" />
          <rect
            x="6"
            y="6"
            width="88"
            height="88"
            fill="none"
            stroke="#b7a88e"
            strokeWidth=".8"
          />
          {Array.from({ length: 18 }, (_, i) => (
            <path
              key={i}
              d={`M${4 + i * 5} 4V96`}
              stroke="#f0e8d8"
              strokeWidth=".5"
            />
          ))}
        </>
      )}
      {type === "sink" && (
        <>
          <rect x="3" y="5" width="94" height="90" rx="5" fill={color} />
          <rect x="12" y="23" width="33" height="57" rx="8" fill="#eaf0eb" />
          <rect x="53" y="23" width="33" height="57" rx="8" fill="#eaf0eb" />
          <path d="M49 14V45" strokeWidth="4" />
          <circle cx="29" cy="52" r="3" />
          <circle cx="70" cy="52" r="3" />
        </>
      )}
      {type === "bath" && (
        <>
          <rect x="7" y="3" width="86" height="94" rx="38" fill="#f8f8f2" />
          <rect x="17" y="12" width="66" height="76" rx="28" fill="#e8eeeb" />
          <circle cx="50" cy="25" r="3" />
          <path d="M50 0V15" strokeWidth="4" />
        </>
      )}
      {type === "toilet" && (
        <>
          <rect x="9" y="4" width="82" height="27" rx="5" fill="#f5f7f0" />
          <ellipse cx="50" cy="59" rx="34" ry="36" fill="#fafaf4" />
          <ellipse cx="50" cy="60" rx="23" ry="26" fill="#e3e9e4" />
          <path d="M42 13H58" />
        </>
      )}
      {type === "shower" && (
        <>
          <rect x="3" y="3" width="94" height="94" fill={color} />
          <path d="M3 3L97 97M3 97L97 3" opacity=".4" />
          <circle cx="50" cy="50" r="4" fill="#9baaa3" />
          <path d="M15 0V22H30" strokeWidth="3" />
          <path d="M3 97H97V3" stroke="#90afb2" strokeWidth="4" />
        </>
      )}
      {type === "door" && (
        <>
          <path d="M0 0H100" stroke="#f4f3ee" strokeWidth="18" />
          <path d="M0 0V96" stroke={color} strokeWidth="5" />
          <path
            d="M0 96A96 96 0 0 0 96 0"
            stroke="#a5a395"
            strokeWidth="1"
            fill="none"
          />
        </>
      )}
      {type === "window" && (
        <>
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            fill="#e5eff0"
            stroke="#6f8584"
            strokeWidth="2"
          />
          <path
            d="M0 30H100M0 70H100M50 0V100"
            stroke="#8caaa9"
            strokeWidth="2"
          />
        </>
      )}
      {type === "opening" && (
        <rect
          x="0"
          y="-10"
          width="100"
          height="120"
          fill={color}
          stroke="none"
        />
      )}
      {type === "stairs" && (
        <>
          <rect x="2" y="2" width="96" height="96" fill={color} />
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d={`M2 ${i * 8}H98`} />
          ))}
          <path
            d="M50 90V10L38 23M50 10L62 23"
            fill="none"
            stroke="#5d625b"
            strokeWidth="2"
          />
        </>
      )}
      {type === "lamp" && (
        <>
          <circle cx="50" cy="50" r="43" fill={color} />
          <circle cx="50" cy="50" r="31" fill="#f3eddd" />
          <circle cx="50" cy="50" r="5" fill="#aa9876" />
        </>
      )}
    </g>
  );
}
export function Thumbnail({
  type,
  color,
}: {
  type: FurnitureType;
  color?: string;
}) {
  return (
    <svg
      viewBox="-12 -20 124 140"
      aria-hidden="true"
      className="furniture-thumb"
    >
      <ellipse cx="53" cy="102" rx="43" ry="7" fill="#000" opacity=".055" />
      <g transform="translate(0 2) rotate(-7 50 50)">
        <Furniture type={type} color={color} />
      </g>
    </svg>
  );
}
