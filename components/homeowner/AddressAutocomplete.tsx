"use client";

import { useEffect, useRef } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Fired when the user picks a suggestion from the dropdown. */
  onPlaceSelected: (
    coords: { lat: number; lng: number },
    formattedAddress: string,
  ) => void;
  /** Fired when the input loses focus (used by parent to forward-geocode raw text / coords). */
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  autoComplete?: string;
}

/**
 * Address input wired to the legacy `google.maps.places.Autocomplete`,
 * restricted to Germany. The classic widget is more stable than the
 * new <gmpx-place-autocomplete> web component for a 15-min ship.
 *
 * The dropdown ("pac-container") is rendered into <body> by Google,
 * so we override its theme via globals/inline <style> in the parent
 * — see the styled <style jsx global> tag below.
 */
export function AddressAutocomplete({
  id,
  value,
  onChange,
  onPlaceSelected,
  onBlur,
  placeholder,
  className,
  autoComplete = "off",
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey || !inputRef.current || acRef.current) return;

    let cancelled = false;
    setOptions({ key: apiKey, v: "weekly" });

    importLibrary("places")
      .then((places) => {
        if (cancelled || !inputRef.current) return;
        const ac = new places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: ["de"] },
          fields: ["geometry", "formatted_address", "name"],
          types: ["address"],
        });
        acRef.current = ac;

        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const loc = place.geometry?.location;
          if (!loc) return;
          const lat = loc.lat();
          const lng = loc.lng();
          const formatted =
            place.formatted_address ?? place.name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          // Mirror the picked text into the input so React state matches.
          onChange(formatted);
          onPlaceSelected({ lat, lng }, formatted);
        });
      })
      .catch(() => {
        // Silent fail — the input still works as a plain field; parent
        // onBlur will forward-geocode via /api/forward-geocode as before.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          // Don't let Enter submit while the suggestion list is open;
          // the listener swallows it. Falling through to blur on Enter
          // keeps the existing forward-geocode-on-blur behavior for
          // raw coord input.
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={className}
      />

      {/* Google renders the suggestion list (".pac-container") into
          <body>, outside our React tree. Override its default light-
          Material look to match the Tesla-precision dark theme. */}
      <style jsx global>{`
        .pac-container {
          background: #12161c;
          border: 1px solid #2a3038;
          border-top: none;
          border-radius: 0 0 8px 8px;
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.4);
          margin-top: 4px;
          font-family: inherit;
          color: #f7f8fa;
          padding: 4px 0;
          z-index: 9999;
        }
        .pac-container:after {
          /* Hide the "powered by Google" image on the dark bg —
             Places ToS still requires attribution somewhere on the
             page. The Google logo on the 3D map satisfies this. */
          background-image: none !important;
          height: 0;
          padding: 0;
          margin: 0;
        }
        .pac-item {
          padding: 8px 14px;
          font-size: 13px;
          line-height: 1.4;
          color: #9ba3af;
          border-top: 1px solid rgba(42, 48, 56, 0.5);
          cursor: pointer;
        }
        .pac-item:first-child {
          border-top: none;
        }
        .pac-item:hover,
        .pac-item-selected,
        .pac-item-selected:hover {
          background: rgba(61, 174, 255, 0.1);
          color: #f7f8fa;
        }
        .pac-item-query {
          color: #f7f8fa;
          font-size: 13px;
          font-weight: 500;
          padding-right: 4px;
        }
        .pac-matched {
          color: #3daeff;
          font-weight: 600;
        }
        .pac-icon,
        .pac-icon-marker {
          /* Hide the gray pin icon — looks out of place on dark theme. */
          display: none;
        }
      `}</style>
    </>
  );
}
