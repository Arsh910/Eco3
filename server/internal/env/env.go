package env

import (
	"os"
	"strconv"
)

func GetEnvString(key string, defaultValue string) string {
	if value, exsits := os.LookupEnv(key); exsits {
		return value
	}

	return defaultValue
}

func GetEnvInt(key string, defaultValue int) int {
	if value, exsits := os.LookupEnv(key); exsits {
		if inVal, err := strconv.Atoi(value); err == nil {
			return inVal
		}
	}

	return defaultValue
}
