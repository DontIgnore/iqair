import { Action, ActionPanel, Detail, LaunchProps, Icon, Color, getPreferenceValues } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { fetchIQAirCityDetailsByName, fetchIQAirTopCities, type IQAirCityDetails } from "../server/iqair";

interface Preferences {
  defaultCity?: string;
}

/**
 * Determines the color for AQI level based on the level string from IQAir
 */
function getAQILevelColor(level: string): Color {
  const levelLower = level.toLowerCase();
  if (levelLower.includes("good") || levelLower.includes("excellent")) {
    return Color.Green;
  } else if (levelLower.includes("moderate") || levelLower.includes("fair")) {
    return Color.Yellow;
  } else if (levelLower.includes("unhealthy for sensitive") || levelLower.includes("sensitive")) {
    return Color.Orange;
  } else if (levelLower.includes("unhealthy")) {
    return Color.Red;
  } else if (levelLower.includes("very unhealthy") || levelLower.includes("hazardous")) {
    return Color.Purple;
  } else {
    return Color.SecondaryText;
  }
}

async function fetchIQAirCityDetails(city: string | null): Promise<IQAirCityDetails> {
  // If city is not specified, get top city and use it
  let targetCity = city && city.trim() ? city : null;

  if (!targetCity) {
    const top = await fetchIQAirTopCities(1);
    if (!top.length) {
      throw new Error("IQAir top list is empty");
    }
    targetCity = top[0].city;
  }

  // Use the new search API to find the city
  const data = await fetchIQAirCityDetailsByName(targetCity);

  if (!data) {
    throw new Error(
      `City "${targetCity}" not found in IQAir database. Please check the spelling or try a different city name.`,
    );
  }

  return data;
}

export default function Command(props: LaunchProps<{ arguments: { city?: string } }>) {
  const { city } = props.arguments;
  const preferences = getPreferenceValues<Preferences>();

  // If city is not specified, use city from preferences
  const targetCity = city && city.trim() ? city : preferences.defaultCity || null;

  const { isLoading, data, error, revalidate } = usePromise(
    async (cityName: string | null) => fetchIQAirCityDetails(cityName),
    [targetCity],
    {
      execute: true,
    },
  );

  if (error) {
    const errorCityName = targetCity || "default city";
    const markdown = `# Error Loading IQAir

Failed to fetch data for **${errorCityName}**.

**Error:** ${error.message}

${!targetCity ? "Set a default city in extension preferences or pass a city, e.g.: `iqair Tashkent`." : "You can pass a city, e.g.: `iqair Tashkent`."}`;

    return (
      <Detail
        isLoading={false}
        markdown={markdown}
        actions={
          <ActionPanel>
            <Action
              title="Try Again"
              icon={Icon.ArrowClockwise}
              onAction={revalidate}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
            />
          </ActionPanel>
        }
      />
    );
  }

  if (isLoading || !data) {
    let loadingText = "";
    if (targetCity) {
      loadingText = `# Loading air quality for **${targetCity}**...`;
    } else {
      loadingText =
        "# Loading data from IQAir...\n\nSet a default city in extension preferences or specify a city when calling the command.";
    }
    return <Detail isLoading={true} markdown={loadingText} />;
  }

  const levelColor = getAQILevelColor(data.level);
  const pollutantsTable =
    data.pollutants && data.pollutants.length > 0
      ? `| Pollutant | Value |\n|-----------|-------|\n${data.pollutants.map((p) => `| **${p.name}** | ${p.value} ${p.unit} |`).join("\n")}`
      : "No data available for individual pollutants.";

  // Format country with capital letter
  const country =
    data.countrySlug && data.countrySlug.length > 0
      ? data.countrySlug[0].toUpperCase() + data.countrySlug.slice(1)
      : data.countrySlug;
  const getLevelStyle = (color: Color) => {
    const styles = {
      [Color.Green]: { bg: "#00E400", text: "#000000" },
      [Color.Yellow]: { bg: "#FFFF00", text: "#000000" },
      [Color.Orange]: { bg: "#FF7E00", text: "#FFFFFF" },
      [Color.Red]: { bg: "#FF0000", text: "#FFFFFF" },
      [Color.Purple]: { bg: "#8F3F97", text: "#FFFFFF" },
    };
    const style = styles[color as keyof typeof styles] || { bg: "#666666", text: "#FFFFFF" };
    return `background-color: ${style.bg}; color: ${style.text}; padding: 4px 12px; border-radius: 6px; font-weight: bold; display: inline-block;`;
  };

  const levelStyle = getLevelStyle(levelColor);

  // Add emoji for visual accent depending on level
  const getLevelEmoji = (level: string) => {
    const levelLower = level.toLowerCase();
    if (levelLower.includes("good") || levelLower.includes("excellent")) {
      return "✅ ";
    } else if (levelLower.includes("moderate") || levelLower.includes("fair")) {
      return "⚠️ ";
    } else if (levelLower.includes("unhealthy for sensitive") || levelLower.includes("sensitive")) {
      return "🔶 ";
    } else if (levelLower.includes("unhealthy")) {
      return "🔴 ";
    } else if (levelLower.includes("very unhealthy") || levelLower.includes("hazardous")) {
      return "🟣 ";
    }
    return "";
  };

  const markdown = `# Air Quality: ${data.city}

## AQI: ${data.aqi}

**Level:** <span style="${levelStyle}">${getLevelEmoji(data.level)}${data.level || "Unknown"}</span>

---

## Air Pollutants

${pollutantsTable}
`;

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="City" text={data.city} />
          <Detail.Metadata.Label title="Country" text={country} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="Main Pollutant"
            text={`${data.mainPollutant.name}: ${data.mainPollutant.value} ${data.mainPollutant.unit}`}
          />
          {data.pollutants && data.pollutants.length > 0 && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Label title="Pollutants" text={`${data.pollutants.length} measured`} />
            </>
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={revalidate}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
          />
          <Action.OpenInBrowser
            title="View on IQAir"
            icon={Icon.Globe}
            url={data.url}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
          />
        </ActionPanel>
      }
    />
  );
}
